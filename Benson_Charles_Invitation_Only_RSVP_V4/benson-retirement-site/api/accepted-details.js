import { readSession } from '../lib/session.js';
import { hasAcceptedDetails } from '../lib/acceptance.js';
import { acceptedDetailsHtml } from '../lib/accepted-details.js';

export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 const session=readSession(req);
 if(!session)return res.status(401).json({error:'Please unlock your private invitation.'});
 if(!await hasAcceptedDetails(req,session))
  return res.status(403).json({error:'Event details are available only after an accepted RSVP.'});
 res.setHeader('Content-Type','text/html; charset=utf-8');
 return res.status(200).send(acceptedDetailsHtml);
}
