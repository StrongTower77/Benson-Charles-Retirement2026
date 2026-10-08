// node scripts/generate-invitations.cjs 'Guest family' 2
// Writes SQL to stdout; invitation code is printed to STDERR to keep plaintext out of SQL.
const { randomBytes,createHash } = require('node:crypto');
const label=process.argv[2],max=Number(process.argv[3]);
if(!label||label.length>120||!/^[1-9]\d?$/.test(process.argv[3]||'')||max>12){console.error('Usage: node scripts/generate-invitations.cjs "Household label" 2   (max 1–12)');process.exit(1);}
const code=randomBytes(16).toString('hex').toUpperCase(),hash=createHash('sha256').update(code).digest('hex');
const escaped=label.replace(/'/g,"''");
console.log(`insert into public.retirement_invitations (code_hash,label,max_guests) values ('${hash}','${escaped}',${max});`);
console.error(`PRIVATE INVITATION CODE — deliver to guest securely: ${code}`);
