import { readSession } from '../lib/session.js';
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 const session=readSession(req);
 if(!session)return res.status(401).json({error:'Please unlock your private invitation.'});
 return res.status(200).json({maxGuests:session.maxGuests});
}
