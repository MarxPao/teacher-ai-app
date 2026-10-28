/**
 * lib/interop/oneroster.ts — Gap 10: OneRoster CSV Import
 * Parser IMS OneRoster 1.1 CSV para importacao de turmas e alunos.
 * LGPD: CPFs e identificadores sao mascarados na importacao.
 */
export interface OneRosterUser {
  sourcedId: string; status: 'active'|'tobedeleted'
  role: 'teacher'|'student'|'administrator'|'guardian'
  username: string; givenName: string; familyName: string
  email?: string; grades?: string[]; orgSourcedIds?: string[]
  userIds?: Array<{type:string;identifier:string}>
}
export interface OneRosterClass {
  sourcedId: string; status: 'active'|'tobedeleted'; title: string
  classCode?: string; classType: 'homeroom'|'scheduled'
  courseSourcedId?: string; orgSourcedId?: string
  termSourcedIds?: string[]; grades?: string[]; subjects?: string[]; subjectCodes?: string[]
}
export interface OneRosterEnrollment {
  sourcedId: string; status: 'active'|'tobedeleted'
  role: 'teacher'|'student'; primary?: boolean
  userSourcedId: string; classSourcedId: string
}
export interface ImportedStudent {
  sourcedId: string; givenName: string; familyName: string
  displayName: string; username: string; email?: string
  grades: string[]; classIds: string[]
}
export interface ImportedClass {
  sourcedId: string; title: string; classCode?: string
  grades: string[]; subjects: string[]; studentIds: string[]; teacherIds: string[]
}
export interface ImportError { file: string; row: number; field?: string; message: string }
export interface OneRosterImportResult {
  students: ImportedStudent[]; classes: ImportedClass[]; errors: ImportError[]
  stats: { usersTotal:number; studentsFound:number; classesFound:number; enrollmentsFound:number; skipped:number }
}
export interface OneRosterCsvBundle {
  'users.csv': string; 'classes.csv': string; 'enrollments.csv': string
  'courses.csv'?: string; 'orgs.csv'?: string
}
function parseCsvLine(line: string): string[] {
  const r: string[] = []; let cur = ''; let inQ = false
  for (let i=0;i<line.length;i++) {
    const ch=line[i]
    if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++}else{inQ=!inQ}}
    else if(ch===','&&!inQ){r.push(cur.trim());cur=''}else{cur+=ch}
  }
  r.push(cur.trim()); return r
}
function parseCsv(content: string): Array<Record<string,string>> {
  const lines=content.split(/\r?\n/).filter(l=>l.trim()); if(!lines.length) return []
  const headers=parseCsvLine(lines[0]).map(h=>h.toLowerCase().replace(/\s+/g,''))
  return lines.slice(1).map(line=>{
    const vals=parseCsvLine(line); const row:Record<string,string>={}
    headers.forEach((h,j)=>{row[h]=vals[j]??''}) ; return row
  })
}
function maskCpf(v: string): string {
  const d=v.replace(/\D/g,''); return d.length===11?`***.***.${d.slice(6,9)}-${d.slice(9)}`:'***'
}
function maskId(type: string, value: string): string {
  if(type.toLowerCase().includes('cpf')||type.toLowerCase().includes('tax')) return maskCpf(value)
  if(type.toLowerCase().includes('email')){const[l,d]=value.split('@');return `${l?.slice(0,2)}***@${d??'***'}`}
  return value.length>3?`${value.slice(0,3)}***`:'***'
}
function parseUsers(content: string, errors: ImportError[]): OneRosterUser[] {
  return parseCsv(content).reduce<OneRosterUser[]>((acc,row,i)=>{
    const sid=row['sourcedid']||row['sourced_id']||row['id']
    if(!sid){errors.push({file:'users.csv',row:i+2,field:'sourcedId',message:'sourcedId ausente'});return acc}
    const role=(row['role']?.toLowerCase()) as OneRosterUser['role']
    if(!['teacher','student','administrator','guardian'].includes(role)){
      errors.push({file:'users.csv',row:i+2,field:'role',message:`Role invalido: ${role}`});return acc}
    const userIds=(row['userids']||'').split(';').filter(Boolean).map(pair=>{
      const[t,id]=pair.split(':'); return{type:t?.trim()??'unknown',identifier:maskId(t?.trim()??'',id?.trim()??'')}
    })
    acc.push({sourcedId:sid,status:(row['status']?.toLowerCase() as any)??'active',role,
      username:row['username']||sid,givenName:row['givenname']||row['firstname']||'',
      familyName:row['familyname']||row['lastname']||'',email:row['email']||undefined,
      grades:row['grades']?row['grades'].split(',').map(g=>g.trim()):[],
      orgSourcedIds:row['orgsourcedids']?row['orgsourcedids'].split(',').map(s=>s.trim()):[],userIds})
    return acc
  },[])
}
function parseClasses(content: string, errors: ImportError[]): OneRosterClass[] {
  return parseCsv(content).reduce<OneRosterClass[]>((acc,row,i)=>{
    const sid=row['sourcedid']||row['sourced_id']||row['id']
    if(!sid){errors.push({file:'classes.csv',row:i+2,field:'sourcedId',message:'sourcedId ausente'});return acc}
    acc.push({sourcedId:sid,status:(row['status']?.toLowerCase() as any)??'active',
      title:row['title']||row['name']||`Turma ${sid}`,classCode:row['classcode']||undefined,
      classType:(row['classtype']?.toLowerCase() as any)??'scheduled',
      courseSourcedId:row['coursesourcedid']||undefined,orgSourcedId:row['orgsourcedid']||undefined,
      termSourcedIds:(row['termsourcedids']||'').split(',').map(s=>s.trim()).filter(Boolean),
      grades:(row['grades']||'').split(',').map(g=>g.trim()).filter(Boolean),
      subjects:(row['subjects']||'').split(',').map(s=>s.trim()).filter(Boolean),
      subjectCodes:(row['subjectcodes']||'').split(',').map(s=>s.trim()).filter(Boolean)})
    return acc
  },[])
}
function parseEnrollments(content: string, errors: ImportError[]): OneRosterEnrollment[] {
  return parseCsv(content).reduce<OneRosterEnrollment[]>((acc,row,i)=>{
    const sid=row['sourcedid']||row['sourced_id']||row['id']
    const uid=row['usersourcedid']||row['user_sourcedid']
    const cid=row['classsourcedid']||row['class_sourcedid']
    if(!sid||!uid||!cid){errors.push({file:'enrollments.csv',row:i+2,message:'Campos obrigatorios ausentes'});return acc}
    acc.push({sourcedId:sid,status:(row['status']?.toLowerCase() as any)??'active',
      role:(row['role']?.toLowerCase() as any)??'student',primary:row['primary']?.toLowerCase()==='true',
      userSourcedId:uid,classSourcedId:cid})
    return acc
  },[])
}
export function importOneRosterBundle(bundle: OneRosterCsvBundle): OneRosterImportResult {
  const errors: ImportError[] = []; let skipped=0
  const allUsers=parseUsers(bundle['users.csv']??'',errors)
  const allClasses=parseClasses(bundle['classes.csv']??'',errors)
  const enrollments=parseEnrollments(bundle['enrollments.csv']??'',errors)
  const students=allUsers.filter(u=>u.role==='student'&&u.status==='active')
  const activeClasses=allClasses.filter(c=>c.status==='active')
  skipped+=allUsers.filter(u=>u.status==='tobedeleted').length+allClasses.filter(c=>c.status==='tobedeleted').length+enrollments.filter(e=>e.status==='tobedeleted').length
  const csMap:Record<string,string[]>={},ctMap:Record<string,string[]>={}
  for(const e of enrollments){if(e.status!=='active')continue;const m=e.role==='student'?csMap:ctMap;(m[e.classSourcedId]??=[]).push(e.userSourcedId)}
  return {
    students:students.map(s=>({sourcedId:s.sourcedId,givenName:s.givenName,familyName:s.familyName,
      displayName:`${s.givenName} ${s.familyName}`.trim()||s.username,username:s.username,email:s.email,
      grades:s.grades??[],classIds:enrollments.filter(e=>e.userSourcedId===s.sourcedId&&e.role==='student'&&e.status==='active').map(e=>e.classSourcedId)})),
    classes:activeClasses.map(c=>({sourcedId:c.sourcedId,title:c.title,classCode:c.classCode,
      grades:c.grades??[],subjects:c.subjects??[],studentIds:csMap[c.sourcedId]??[],teacherIds:ctMap[c.sourcedId]??[]})),
    errors,stats:{usersTotal:allUsers.length,studentsFound:students.length,classesFound:activeClasses.length,
      enrollmentsFound:enrollments.filter(e=>e.status==='active').length,skipped}
  }
}
export async function readOneRosterFiles(files: File[]): Promise<Partial<OneRosterCsvBundle>> {
  const bundle: Partial<OneRosterCsvBundle>={}
  const valid=['users.csv','classes.csv','enrollments.csv','courses.csv','orgs.csv']
  for(const f of files){const n=f.name.toLowerCase() as keyof OneRosterCsvBundle;if(valid.includes(n))(bundle as any)[n]=await f.text()}
  return bundle
}
export function validateBundle(bundle: Partial<OneRosterCsvBundle>): string[] {
  return(['users.csv','classes.csv','enrollments.csv'] as (keyof OneRosterCsvBundle)[]).filter(f=>!bundle[f])
}
