function buildFootageQuery(subject, context = null) {
  const footageTerms = 'interview OR speech OR conference OR keynote OR testimony OR documentary OR announcement OR hearing'
  const contextMap = {
    person:  `"${subject}" ${footageTerms}`,
    company: `"${subject}" CEO OR earnings OR announcement OR documentary ${footageTerms}`,
    event:   `"${subject}" footage OR documentary OR news`,
    default: `"${subject}" ${footageTerms}`,
  }
  return contextMap[context] || contextMap.default
}

module.exports = { buildFootageQuery }
