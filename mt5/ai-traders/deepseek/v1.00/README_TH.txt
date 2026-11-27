DeepSeek Gold M5 EA v1.00 - คู่มือติดตั้ง

1. เปิด MT5 > File > Open Data Folder > MQL5 > Experts
2. คัดลอก DeepSeek_Gold_M5.mq5 ไปยัง Experts
3. เปิด MetaEditor แล้ว Compile (F7) ตรวจสอบว่าขึ้น 0 errors
4. MT5 > Tools > Options > Expert Advisors > Allow WebRequest for listed URL
   เพิ่ม https://api.deepseek.com
5. เปิดกราฟ XAUUSD (หรือชื่อสัญลักษณ์ทองของโบรกเกอร์) TF M5
6. ลาก EA ลงกราฟ ใส่ InpApiKey จากบัญชี DeepSeek API
7. เปิด Algo Trading; เริ่มจากบัญชี DEMO
8. InpEnableTrading เริ่มต้น false; เปลี่ยนเป็น true เฉพาะเมื่อพร้อมทดสอบอัตโนมัติ

การทำงาน: เรียก API เมื่อแท่ง M5 ปิด; ส่ง OHLC และ tick volume ย้อนหลัง, EMA50, ATR14; รับ BUY/SELL/WAIT
SL = max(ATR*1.5, 150 points, broker stop minimum); TP = 2 เท่าของ SL distance
คำนวณล็อตจากความเสี่ยง 0.5% ของ equity โดย OrderCalcProfit
บล็อกคำสั่งใหม่เมื่อ equity ต่ำกว่าค่า baseline ตอนเริ่มวันเซิร์ฟเวอร์ 2%
มีเพียง 1 position ของ EA ต่อ symbol/magic; ไม่ควบคุม position ที่เปิดมือหรือ EA อื่น

คำเตือน:
- API key ถูกเก็บใน Inputs ของ MT5: ห้ามแชร์ไฟล์ .set หรือภาพหน้าจอที่เห็น key
- ตัว EA ต่อ DeepSeek API โดยตรง ไม่ใช่ผ่าน proxy; หากใช้จริงระยะยาวควรย้าย key ไป server
- ไม่มีการทดสอบ compile หรือ forward-test บน MT5 ในสภาพแวดล้อมนี้
- WebRequest ใช้ไม่ได้ใน MT5 Strategy Tester; ทดสอบ API จริงผ่านบัญชี demo/live terminal
- daily loss baseline เป็น equity ตอนเริ่มใช้งานในวันนั้น ไม่ใช่ยอด equity เวลา 00:00 ที่บันทึกถาวร
- ไม่ปิดสถานะค้างเมื่อถึง daily limit; ป้องกันเฉพาะการเปิดใหม่
- API มีค่าใช้จ่ายและอาจตอบช้ากว่าจังหวะตลาด
- AI ไม่ใช่หลักประกันกำไร และไม่รู้ข่าว/footprint/OI หากไม่ได้ส่งข้อมูล
