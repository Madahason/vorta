/* Reusable form field components that apply the Vorta design system classes */

export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`vorta-field ${className}`}>
      {label && <label className="vorta-label">{label}</label>}
      {children}
      {hint && <p className="vorta-hint">{hint}</p>}
    </div>
  )
}

export function FieldRow({ children, className = '' }) {
  return <div className={`vorta-field-row ${className}`}>{children}</div>
}

export function TextInput({ label, hint, className = '', ...props }) {
  if (label) {
    return (
      <Field label={label} hint={hint}>
        <input className={`vorta-input ${className}`} {...props} />
      </Field>
    )
  }
  return <input className={`vorta-input ${className}`} {...props} />
}

export function NumberInput({ label, hint, className = '', ...props }) {
  if (label) {
    return (
      <Field label={label} hint={hint}>
        <input type="number" className={`vorta-input ${className}`} {...props} />
      </Field>
    )
  }
  return <input type="number" className={`vorta-input ${className}`} {...props} />
}

export function SearchInput({ className = '', ...props }) {
  return (
    <input
      type="search"
      className={`vorta-input ${className}`}
      {...props}
    />
  )
}

export function SelectInput({ label, hint, children, className = '', ...props }) {
  if (label) {
    return (
      <Field label={label} hint={hint}>
        <select className={`vorta-select ${className}`} {...props}>
          {children}
        </select>
      </Field>
    )
  }
  return (
    <select className={`vorta-select ${className}`} {...props}>
      {children}
    </select>
  )
}

export function TextareaInput({ label, hint, mono = false, className = '', ...props }) {
  const cls = `vorta-textarea ${mono ? 'vorta-textarea-mono' : ''} ${className}`
  if (label) {
    return (
      <Field label={label} hint={hint}>
        <textarea className={cls} {...props} />
      </Field>
    )
  }
  return <textarea className={cls} {...props} />
}

export function SliderInput({ label, value, displayValue, hint, className = '', ...props }) {
  return (
    <div className={`vorta-field ${className}`}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="vorta-label" style={{ marginBottom: 0 }}>{label}</label>
          {displayValue !== undefined && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums' }}>
              {displayValue}
            </span>
          )}
        </div>
      )}
      <input type="range" value={value} className={`vorta-slider ${className}`} {...props} />
      {hint && <p className="vorta-hint">{hint}</p>}
    </div>
  )
}

export function ColorInput({ label, hint, className = '', ...props }) {
  if (label) {
    return (
      <Field label={label} hint={hint}>
        <input type="color" className={`vorta-color ${className}`} {...props} />
      </Field>
    )
  }
  return <input type="color" className={`vorta-color ${className}`} {...props} />
}

export function Button({ variant = 'secondary', size = '', children, className = '', ...props }) {
  const variantCls = `vorta-btn-${variant}`
  const sizeCls = size === 'sm' ? 'vorta-btn-sm' : ''
  return (
    <button className={`vorta-btn ${variantCls} ${sizeCls} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function FormCard({ children, className = '' }) {
  return <div className={`vorta-panel ${className}`}>{children}</div>
}
