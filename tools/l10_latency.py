"""Measure how long the L10 hub takes to ACK a colour frame.

SignalRGB must be closed (it owns COM4):
    python tools/l10_latency.py

Prints the handshake reply and the ACK latency of five 600-LED frames. Measured
2026-11-13: 122-126 ms per frame, which is why the vendor app's ACK-locked live
loop settles at ~8 fps and why the plugin paces at 8 Hz.
"""
import serial, time, sys

def crc8(b):
    x=0
    for v in b: x^=v
    return x&0xff

def frame(hdr, payload):
    v=payload+crc8(payload).to_bytes(1,'big')
    return bytes(hdr)+len(v).to_bytes(2,'big')+v

def colour(rgb):
    return frame([0x55,0x25,0x21,0,0,0], rgb)

def fill():
    counts=[60]*10
    val=list(range(12))+counts
    return frame([0x55,0x25,0x22,0,0,0,0], bytes(val))

s=serial.Serial('COM4',2000000,timeout=0.05,write_timeout=2.0)
s.reset_input_buffer()
s.write(bytes([0x55,0x15,0x01,0,0])); t=time.time()
buf=b''
while time.time()-t<0.5:
    buf+=s.read(64)
print('handshake reply', len(buf), 'bytes in %.0f ms'%((time.time()-t)*1000), buf[:8].hex())

s.reset_input_buffer()
s.write(fill()); t=time.time(); got=b''
while time.time()-t<0.5 and b'\x55\x04\x02' not in got:
    got+=s.read(64)
print('fillCount ack after %.0f ms'%((time.time()-t)*1000), got[:5].hex())

rgb=bytes([10,20,30])*600
for i in range(5):
    s.reset_input_buffer()
    t=time.time()
    s.write(colour(rgb))
    got=b''
    while time.time()-t<0.5 and not got.endswith(b'\x55\x04\x02\x00\x00'):
        got+=s.read(64)
    print('frame %d ack %.1f ms rx=%s'%(i,(time.time()-t)*1000, got.hex()))
s.close()
