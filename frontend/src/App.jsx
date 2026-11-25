import { useEffect, useState } from 'react'

const ENDPOINT = '/api/patients'
const EMPTY = {
  name: '',
  age: '',
  gender: '',
  ward: '',
  department: '',
  doctor: '',
  admission_date: '',
  status: 'Admitted',
}
const EMPTY_FILTERS = { ward: '', department: '', doctor: '', search: '' }

function today() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed')
    error.errors = data.errors || {}
    throw error
  }
  return data
}

function validate(form) {
  const errors = {}
  const name = form.name.trim()
  if (!name) errors.name = 'Name is required.'
  else if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) errors.name = 'Name must contain letters only.'

  const age = String(form.age).trim()
  if (!age) errors.age = 'Age is required.'
  else if (!/^\d+$/.test(age) || Number(age) < 0 || Number(age) > 120) {
    errors.age = 'Age must be a number between 0 and 120.'
  }

  for (const key of ['gender', 'ward', 'department', 'doctor', 'status']) {
    if (!form[key]) errors[key] = `${key.replace('_', ' ')} is required.`
  }
  if (!form.admission_date) errors.admission_date = 'Admission date is required.'
  else if (form.admission_date > today()) errors.admission_date = 'Admission date cannot be in the future.'
  return errors
}

function Field({ label, name, value, onChange, error, type = 'text', options, min, max }) {
  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select name={name} value={value} onChange={onChange}>
          <option value="">-- Select --</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input name={name} type={type} value={value} onChange={onChange} min={min} max={max} />
      )}
      {error && <small className="error">{error}</small>}
    </label>
  )
}

export default function App() {
  const [options, setOptions] = useState({ genders: [], wards: [], departments: [], doctors: [], statuses: [] })
  const [patients, setPatients] = useState([])
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  async function refresh(nextFilters = filters) {
    const query = new URLSearchParams(Object.entries(nextFilters).filter(([, value]) => value))
    setPatients(await api(`${ENDPOINT}?${query}`))
  }

  useEffect(() => {
    Promise.all([api('/api/options'), api(ENDPOINT)])
      .then(([choices, list]) => {
        setOptions(choices)
        setPatients(list)
      })
      .catch((error) => setMessage(error.message))
  }, [])

  function change(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function changeFilter(event) {
    const { name, value } = event.target
    const next = { ...filters, [name]: value }
    setFilters(next)
    refresh(next).catch((error) => setMessage(error.message))
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      if (editing) {
        await api(`${ENDPOINT}/${editing}`, { method: 'PUT', body: JSON.stringify(form) })
        setMessage('Patient updated.')
      } else {
        await api(ENDPOINT, { method: 'POST', body: JSON.stringify(form) })
        setMessage('Patient added.')
      }
      setForm(EMPTY)
      setEditing(null)
      await refresh()
    } catch (error) {
      setMessage(error.message)
      setErrors(error.errors)
    }
  }

  function startEdit(patient) {
    setEditing(patient.id)
    setForm({
      name: patient.name,
      age: String(patient.age),
      gender: patient.gender,
      ward: patient.ward,
      department: patient.department,
      doctor: patient.doctor,
      admission_date: patient.admission_date,
      status: patient.status,
    })
    setErrors({})
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY)
    setErrors({})
  }

  async function discharge(patient) {
    try {
      await api(`${ENDPOINT}/${patient.id}/discharge`, { method: 'PATCH' })
      setMessage('Patient marked as discharged.')
      await refresh()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function remove(patient) {
    if (!window.confirm(`Delete ${patient.name}? This cannot be undone.`)) return
    try {
      await api(`${ENDPOINT}/${patient.id}`, { method: 'DELETE' })
      setMessage('Patient deleted.')
      await refresh()
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <>
      <header><h1>Patient Admission Management</h1></header>
      <main>
        {message && <div className="flash">{message}</div>}

        <section className="card">
          <h2>{editing ? 'Edit patient' : 'Add patient'}</h2>
          <form onSubmit={submit} noValidate>
            <div className="grid">
              <Field label="Name" name="name" value={form.name} onChange={change} error={errors.name} />
              <Field label="Age" name="age" type="number" min="0" max="120" value={form.age} onChange={change} error={errors.age} />
              <Field label="Gender" name="gender" options={options.genders} value={form.gender} onChange={change} error={errors.gender} />
              <Field label="Ward" name="ward" options={options.wards} value={form.ward} onChange={change} error={errors.ward} />
              <Field label="Department" name="department" options={options.departments} value={form.department} onChange={change} error={errors.department} />
              <Field label="Doctor" name="doctor" options={options.doctors} value={form.doctor} onChange={change} error={errors.doctor} />
              <Field label="Admission Date" name="admission_date" type="date" max={today()} value={form.admission_date} onChange={change} error={errors.admission_date} />
              <Field label="Status" name="status" options={options.statuses} value={form.status} onChange={change} error={errors.status} />
            </div>
            <div className="form-actions">
              <button type="submit">{editing ? 'Save changes' : 'Add patient'}</button>
              {editing && <button type="button" className="secondary" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </section>

        <section className="card">
          <h2>Filters</h2>
          <div className="grid">
            <label className="field">
              <span>Ward</span>
              <select name="ward" value={filters.ward} onChange={changeFilter}>
                <option value="">All wards</option>
                {options.wards.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select name="department" value={filters.department} onChange={changeFilter}>
                <option value="">All departments</option>
                {options.departments.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Doctor</span>
              <select name="doctor" value={filters.doctor} onChange={changeFilter}>
                <option value="">All doctors</option>
                {options.doctors.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Search name</span>
              <input name="search" type="search" value={filters.search} onChange={changeFilter} placeholder="e.g. Arjun" />
            </label>
          </div>
        </section>

        <section className="card">
          <h2>Patients ({patients.length})</h2>
          {patients.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Age</th><th>Gender</th><th>Ward</th><th>Department</th><th>Doctor</th><th>Admitted</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr key={patient.id}>
                      <td data-label="Name">{patient.name}</td>
                      <td data-label="Age">{patient.age}</td>
                      <td data-label="Gender">{patient.gender}</td>
                      <td data-label="Ward">{patient.ward}</td>
                      <td data-label="Department">{patient.department}</td>
                      <td data-label="Doctor">{patient.doctor}</td>
                      <td data-label="Admitted">{patient.admission_date}</td>
                      <td data-label="Status"><span className={`badge ${patient.status === 'Discharged' ? 'discharged' : ''}`}>{patient.status}</span></td>
                      <td data-label="Actions">
                        <div className="actions">
                          <button type="button" className="secondary" onClick={() => startEdit(patient)}>Edit</button>
                          {patient.status === 'Admitted' && <button type="button" onClick={() => discharge(patient)}>Discharge</button>}
                          <button type="button" className="danger" onClick={() => remove(patient)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No patients found.</p>}
        </section>
      </main>
    </>
  )
}
