import test from 'node:test';
import assert from 'node:assert/strict';
import { customMailSchema, publicMailIp } from '../lib/custom-mail';
test('custom mail rejects internal IP ranges and special targets',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','::1','1.2.3.999']) assert.equal(publicMailIp(ip),false,ip);
  assert.equal(publicMailIp('8.8.8.8'),true);
  assert.equal(publicMailIp('192.88.99.1'),false);
  assert.equal(publicMailIp('192.2.0.1'),true);
});
test('custom mail requires hostname and secure submission port',()=>{
  const valid={imap:'wmbox4.ecount.com',smtp:'wsmtp.ecount.com',port:587,username:'ctg81@mediprotech.com'};
  assert.equal(customMailSchema.safeParse(valid).success,true);
  for(const imap of ['127.0.0.1','localhost','https://mail.example.com','mail.example.com/path']) assert.equal(customMailSchema.safeParse({...valid,imap}).success,false);
  assert.equal(customMailSchema.safeParse({...valid,port:25}).success,false);
  assert.equal(customMailSchema.safeParse({...valid,username:'a\r\nb'}).success,false);
});
