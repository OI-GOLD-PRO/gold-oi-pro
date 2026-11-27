DeepSeek Gold M5 Adaptive v1.10

ติดตั้ง:
1. คัดลอก DeepSeek_Gold_M5_Adaptive_v1_10.mq5 ไป MQL5/Experts
2. เปิด MetaEditor แล้ว Compile (F7); ต้องตรวจสอบ errors บน MT5 ของคุณ
3. MT5 > Tools > Options > Expert Advisors > Allow WebRequest for listed URL:
   https://api.deepseek.com
4. แนบ EA กับกราฟ XAUUSD (หรือชื่อสัญลักษณ์ทองของโบรกเกอร์) M5
5. ใส่ API key ใน InpApiKey; ตรวจสอบ InpModel ว่าบัญชี DeepSeek รองรับ
6. เริ่มต้นด้วย InpEnableTrading=false, ทดสอบ Demo แล้วจึงเปิด true

ความสามารถ:
- ส่งแท่ง M5 ที่ปิดแล้ว, ATR, EMA, Equity และสถานะออเดอร์ EA ไป DeepSeek ทุกแท่ง M5
- AI เสนอ BUY/SELL/WAIT หรือ HOLD/CLOSE/REDUCE พร้อม risk_pct, sl_atr, rr
- EA บังคับ risk_pct <= 0.5% ต่อไม้, RR และ SL ATR ตามขอบเขต Inputs
- ตรวจ spread, price drift, margin, stop distance, daily equity limit
- Lot คำนวณด้วย OrderCalcProfit และปัดลงตาม volume step
- HOLD สามารถเลื่อน SL ให้แคบลงเท่านั้น; CLOSE ปิดด้วย ticket
- REDUCE partial close เฉพาะบัญชี hedging และเมื่อ volume คงเหลือถูกต้อง
- daily baseline บันทึกใน terminal global variables เพื่อคงค่าหลังรีสตาร์ต (ภายใน terminal เดิม)

ข้อจำกัดที่สำคัญ:
- ยังไม่ได้ Compile หรือทดสอบจริงกับ MetaEditor/โบรกเกอร์
- WebRequest ใช้ใน MT5 Strategy Tester ไม่ได้ตามปกติ; ต้องทำ mock/replay สำหรับ backtest
- ไม่มีการคำนวณค่าคอมมิชชันหรือ slippage ที่อาจทำให้ขาดทุนเกินงบ
- ไม่มีการติดตามความเสี่ยงจาก manual trades/EA อื่น; max total risk นับเฉพาะ Magic+Symbol นี้
- Daily loss guard บล็อกการส่งคำสั่งใหม่ แต่ไม่ได้บังคับปิดทุกออเดอร์เมื่อแตะขีดจำกัด
- หาก API ไม่ตอบ จะไม่เปิดคำสั่งใหม่; SL/TP เดิมยังอยู่ที่โบรกเกอร์
- ไม่มีการยืนยันความแม่นยำของ AI; AI risk suggestion ไม่ใช่ความน่าจะเป็นของกำไร
- เก็บ API key ใน input ของ MT5; อย่าแชร์ .set หรือ screenshot ที่มี key
- ควรใช้บัญชี hedging สำหรับ REDUCE; บัญชี netting จะไม่ทำ partial close
- ใช้กับบัญชีทดลองก่อนเท่านั้นจนกว่าจะตรวจสอบ compile, execution และ failure cases
