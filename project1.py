"""Patient Admission Management API.

Run with: python project1.py
"""

import json
import os
import re
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import mysql.connector

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend", "dist")

GENDERS = ["Male", "Female", "Other"]
WARDS = ["General", "ICU", "Pediatrics", "Maternity", "Surgery", "Emergency", "Psychiatric", "Rehabilitation", "Oncology", "Cardiology"]
DEPARTMENTS = [
    "General Medicine",
    "Cardiology",
    "Neurology",
    "Orthopedics",
    "Pediatrics",
    "Surgery",
    "Neurology",
    "Oncology",
    "Cardiology"
]
DOCTORS = ["Dr.  Manoj Sharma", "Dr.  Depak Patel", "Dr. Rishi Raj Das", "Dr. Yathartha Jain", "Dr. Vasant k","Dr. Mehul Batham","Dr. MK Rawat"]
STATUSES = ["Admitted", "Discharged", "Under Observation", "Transferred", "Deceased", "Critical", "Stable"]
CHOICES = {
    "gender": GENDERS,
    "ward": WARDS,
    "department": DEPARTMENTS,
    "doctor": DOCTORS,
    "status": STATUSES,
}
FIELDS = (
    "name",
    "age",
    "gender",
    "ward",
    "department",
    "doctor",
    "admission_date",
    "status",
)
NAME = re.compile(r"^[A-Za-z]+(?: [A-Za-z]+)*$")
PATIENT_PATH = re.compile(r"^/api/patients/(\d+)(/discharge)?$")


def load_env():
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(path):
        return
    with open(path) as file:
        for line in file:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


load_env()


def setting(name):
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is missing. Add it to the .env file.")
    return value


def connect():
    return mysql.connector.connect(
        host=setting("DB_HOST"),
        user=setting("DB_USER"),
        password=setting("DB_PASSWORD"),
        database=setting("DB_NAME"),
    )


def query(sql, params=()):
    connection = connect()
    cursor = connection.cursor(dictionary=True)
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    cursor.close()
    connection.close()
    for row in rows:
        if isinstance(row.get("admission_date"), date):
            row["admission_date"] = row["admission_date"].isoformat()
    return rows


def change(sql, params=()):
    connection = connect()
    cursor = connection.cursor()
    cursor.execute(sql, params)
    connection.commit()
    cursor.close()
    connection.close()


def init_db():
    change(
        """CREATE TABLE IF NOT EXISTS patients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            age INT NOT NULL,
            gender VARCHAR(20) NOT NULL,
            ward VARCHAR(30) NOT NULL,
            department VARCHAR(40) NOT NULL,
            doctor VARCHAR(40) NOT NULL,
            admission_date DATE NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'Admitted'
        )"""
    )


def validate(data):
    clean = {key: str(data.get(key) or "").strip() for key in FIELDS}
    errors = {}

    if not clean["name"]:
        errors["name"] = "Name is required."
    elif not NAME.fullmatch(clean["name"]):
        errors["name"] = "Name must contain letters and spaces only."

    age = clean["age"]
    if not age:
        errors["age"] = "Age is required."
    elif not age.isdigit() or not 0 <= int(age) <= 120:
        errors["age"] = "Age must be a number between 0 and 120."
    else:
        clean["age"] = int(age)

    for key, choices in CHOICES.items():
        label = key.replace("_", " ").title()
        if not clean[key]:
            errors[key] = f"{label} is required."
        elif clean[key] not in choices:
            errors[key] = f"Choose a valid {label.lower()}."

    admitted = clean["admission_date"]
    if not admitted:
        errors["admission_date"] = "Admission date is required."
    else:
        try:
            if date.fromisoformat(admitted) > date.today():
                errors["admission_date"] = "Admission date cannot be in the future."
        except ValueError:
            errors["admission_date"] = "Enter a valid date in YYYY-MM-DD format."

    return clean, errors


def invalid(errors):
    message = "; ".join(f"{key}: {value}" for key, value in errors.items())
    return {"error": message, "errors": errors}


def list_patients(path):
    params = parse_qs(urlparse(path).query)
    conditions, values = [], []
    for key in ("ward", "department", "doctor"):
        value = params.get(key, [""])[0].strip()
        if value:
            conditions.append(f"{key} = %s")
            values.append(value)
    search = params.get("search", [""])[0].strip()
    if search:
        conditions.append("name LIKE %s")
        values.append(f"%{search}%")
    sql = "SELECT * FROM patients"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    return query(sql + " ORDER BY id DESC", tuple(values))


def patient_exists(patient_id):
    return bool(query("SELECT id FROM patients WHERE id = %s", (patient_id,)))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/options":
            return self.send_json(
                200,
                {
                    "genders": GENDERS,
                    "wards": WARDS,
                    "departments": DEPARTMENTS,
                    "doctors": DOCTORS,
                    "statuses": STATUSES,
                },
            )
        if path == "/api/patients":
            return self.send_json(200, list_patients(self.path))
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Not found"})
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/patients":
            return self.send_json(404, {"error": "Not found"})
        patient, errors = validate(self.read_json())
        if errors:
            return self.send_json(400, invalid(errors))
        change(
            "INSERT INTO patients "
            "(name, age, gender, ward, department, doctor, admission_date, status) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            tuple(patient[key] for key in FIELDS),
        )
        self.send_json(201, {"message": "Patient added."})

    def do_PUT(self):
        match = PATIENT_PATH.fullmatch(urlparse(self.path).path)
        if not match or match.group(2):
            return self.send_json(404, {"error": "Not found"})
        patient_id = int(match.group(1))
        if not patient_exists(patient_id):
            return self.send_json(404, {"error": "Patient not found."})
        patient, errors = validate(self.read_json())
        if errors:
            return self.send_json(400, invalid(errors))
        change(
            "UPDATE patients SET name=%s, age=%s, gender=%s, ward=%s, department=%s, "
            "doctor=%s, admission_date=%s, status=%s WHERE id=%s",
            tuple(patient[key] for key in FIELDS) + (patient_id,),
        )
        self.send_json(200, {"message": "Patient updated."})

    def do_PATCH(self):
        match = PATIENT_PATH.fullmatch(urlparse(self.path).path)
        if not match or match.group(2) != "/discharge":
            return self.send_json(404, {"error": "Not found"})
        patient_id = int(match.group(1))
        if not patient_exists(patient_id):
            return self.send_json(404, {"error": "Patient not found."})
        change("UPDATE patients SET status='Discharged' WHERE id=%s", (patient_id,))
        self.send_json(200, {"message": "Patient marked as discharged."})

    def do_DELETE(self):
        match = PATIENT_PATH.fullmatch(urlparse(self.path).path)
        if not match or match.group(2):
            return self.send_json(404, {"error": "Not found"})
        patient_id = int(match.group(1))
        if not patient_exists(patient_id):
            return self.send_json(404, {"error": "Patient not found."})
        change("DELETE FROM patients WHERE id=%s", (patient_id,))
        self.send_json(200, {"message": "Patient deleted."})


if __name__ == "__main__":
    init_db()
    ThreadingHTTPServer(("0.0.0.0", 5000), Handler).serve_forever()
