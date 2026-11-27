# ซอร์ส EA AI สำหรับ MT5

ชุดส่งมอบถึง 27 พฤศจิกายน 2026 ที่รวบรวมจากไฟล์ต้นฉบับและแพ็กเกจอัปเดต Windows ของ OI Gold เวอร์ชัน EA ดูจาก `#property version` ใน MQ5 ส่วนเวอร์ชัน launcher และแดชบอร์ดดูจากแพ็กเกจของแต่ละระบบ

| ระบบ | โค้ด |
|---|---|
| SMC AI | [EA และ Journal](smc/EA), [กลยุทธ์และแดชบอร์ด](smc/runtime), [สคริปต์ Windows รุ่น 1.16](smc/windows) |
| Breakout AI | [EA และ Journal จากชุด 1.06](breakout/EA), [กลยุทธ์และแดชบอร์ด](breakout/runtime), [สคริปต์ Windows รุ่น 1.13](breakout/windows), [ซอร์สรุ่นก่อน](breakout/previous) |
| AI Trader / DON / OpenCode Go | [โค้ดฐานจากตัวติดตั้ง Windows](don/base), [EA รุ่น 1.21](don/ea-1.21), [แพตช์ตามชื่อชุดส่งมอบ](don/updates), [EA จากชุด 1.26](don/updates/OI-Trader-1.26), [กราฟ DON รุ่น 1.29](don/updates/OI-Gold-DON-Trend-1.29) |
| DeepSeek Gold M5 | [รุ่น 1.00](deepseek/v1.00), [Adaptive Money Management รุ่น 1.10](deepseek/adaptive-1.10) |

สำหรับ SMC และ Breakout โฟลเดอร์ runtime แสดงไฟล์ที่ถอดจาก archive ใน launcher เพื่อให้ค้นและแก้ซอร์สได้ เมื่อออกอัปเดต Windows ต้องบรรจุ runtime ที่แก้กลับเข้า launcher และปรับรุ่นที่ใช้เลือกโฟลเดอร์ติดตั้งตามกลไกของชุดนั้น สคริปต์อัปเดตใช้โปรไฟล์เดิมบนเครื่อง Windows

สำหรับ DON เก็บแพตช์แต่ละชุดแยกโฟลเดอร์ตามชื่อแพ็กเกจ เพราะแต่ละชุดอ้างไฟล์และรุ่นฐานต่างกัน การประกอบรุ่นให้ดู install.mjs, update.mjs หรือสคริปต์ติดตั้งในชุดนั้น พร้อมกับ [handoff งาน MT5](../../HANDOFF.md#mt5-nov-2026) ไฟล์ต้นฉบับของตัวห่อ EXE Start-Phone แยกเดี่ยวไม่ปรากฏในชุดส่งมอบที่พบ สคริปต์ Start-Phone อยู่ในโค้ดฐานและชุดแก้ไข
