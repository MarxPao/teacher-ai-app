import { matchStudentByName } from '../../lib/studentMatcher'
import fs from 'fs'

try {
  const inputRaw = fs.readFileSync(0, 'utf-8')
  const input = JSON.parse(inputRaw)
  const results = input.scenarios.map((sc: any) => {
    const opts = {
      matricula: sc.matricula || undefined,
      class_ref: sc.class_ref || undefined
    }
    return matchStudentByName(sc.query_name, input.roster, opts)
  })
  console.log(JSON.stringify(results))
} catch (err: any) {
  console.error(err)
  process.exit(1)
}
