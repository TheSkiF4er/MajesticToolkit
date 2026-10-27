import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimer,validateTimer,validateTimers,remainingLabel,timerAlarm,timerNotification,MAX_TIMERS} from '../src/lib/timers-core.mjs';
const t0=1780000000000;
const make=(minutes=15)=>createTimer({title:'Перерыв',minutes},t0,'test-timer-0001');
test('timer uses an absolute deadline; exact minute countdown survives UI closure',()=>{
 const timer=make(15);
 assert.equal(timer.expiresAt,t0+900000);
 assert.equal(timer.status,'active');
 assert.equal(remainingLabel(timer.expiresAt-t0),'15:00');
 assert.equal(remainingLabel(0),'00:00');
 assert.equal(remainingLabel(3661000),'01:01:01');
});
test('timer labels and duration are bounded, with no partial/NaN records',()=>{
 for(const minutes of [-1,0,1.5,'NaN',NaN,10081])assert.throws(()=>createTimer({title:'Test',minutes},t0,'test-timer-0001'));
 assert.equal(make(10080).expiresAt,t0+10080*60000);
 assert.throws(()=>createTimer({title:'',minutes:15},t0,'test-timer-0001'));
 assert.throws(()=>validateTimer({...make(),expiresAt:t0-1}));
 assert.throws(()=>validateTimer({...make(),status:'invalid'}));
});
test('timer storage validates duplicates and record bounds',()=>{
 assert.deepEqual(validateTimers(undefined),[]);
 assert.throws(()=>validateTimers([make(),make()]));
 assert.throws(()=>validateTimers(Array.from({length:MAX_TIMERS+1},(_,i)=>({...make(),id:`test-timer-${String(i).padStart(4,'0')}`}))));
 assert.equal(timerAlarm(make().id),'majestic-toolkit-timer:test-timer-0001');
 assert.equal(timerNotification(make().id),'majestic-toolkit-timer-notification:test-timer-0001');
});
