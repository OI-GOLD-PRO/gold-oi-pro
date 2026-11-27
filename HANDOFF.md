# OI Gold Pro — เอกสารส่งต่องาน

อัปเดต 26 พฤศจิกายน 2026 (เวลาไทย) สำหรับเจ้าของโปรเจกต์ นักพัฒนา และผู้ช่วย AI ที่รับงานต่อ จุดเริ่มต้นของระบบคือระดับจาก COMEX Gold Options ประกอบกับราคา โครงสร้างแท่ง และแรงซื้อขาย ส่วนการส่งคำสั่งและยืนยันผลใช้ราคาและข้อมูลบัญชีจากโบรกเกอร์ MT5

[ทะเบียน EA MT5 เดือนพฤศจิกายน](#mt5-nov-2026) · [ระบบและซอร์ส](#systems) · [ข้อมูลและกราฟ](#data) · [OI Session Fade และ MT5](#mt5) · [งาน AI](#ai) · [การดูแลและทดสอบ](#checks)

<a name="systems"></a>

## ระบบและซอร์ส

| ระบบ | สถานะ ณ ซอร์สที่ตรวจ | จุดเริ่มต้น |
| --- | --- | --- |
| OI Gold Pro | PWA **V4.9.163** บน `main` `a899215` | [เว็บวิเคราะห์][pro-app], [index.html](index.html), [CHANGELOG](CHANGELOG.md) |
| OI Gold Pro Trade | **V0.13.00** บน `main` `c601bcb` พอร์ตกราฟจาก Pro V4.9.163 | [เว็บ Trade][trade-app], [Trade repo][trade-repo], [CHANGELOG][trade-log] |
| Worker ข้อมูล / Trade Hub | ซอร์สใน `gold-oi-trade` รีวิชันเดียวกับ Trade | [gcw][gcw], [hub][hub], [Trade Bridge EA v1.10][bridge] |
| OI Gold Pro Mini | เฟิร์มแวร์ ESP32 CYD **v0.7.11** และ `/mini` API v2 | [Mini handoff][mini] |
| แดชบอร์ดพอร์ต MT5 | **v1.0.00** ตาม changelog, โค้ดอยู่ใน `portdash/` | [Port Dashboard][portdash] |
| OI Session Fade | เว็บ `osf.js`, Worker `/osf/v1`, EA ใน GitHub **v1.55** และไฟล์ส่งแยก **v1.65** | [เว็บ](osf.js), [OSF handoff][osf], [EA ใน GitHub][osf-ea] |
| Opposite Delta Recovery | มีอินดิเคเตอร์, Worker และ EA ใน `main` | [แอป](opposite-delta-diamonds.js), [Worker](workers/opposite-delta), [คู่มือติดตั้ง](mt5/OPPOSITE_DELTA_SETUP.md) |
| OI Gold AI Roundtable | **v1.0.7** ตาม manifest ของ UI ส่วนกลาง, เซิร์ฟเวอร์รันบน Windows ของผู้ใช้ | [คู่มือ](ai-roundtable-ui/README.md), [manifest](ai-roundtable-ui/manifest.json), [หน้าเชื่อมมือถือ](ai-entry/index.html) |
| OI Gold AI Trader | Dashboard, Local bridge, journal, EA **Demo v1.20** และตัวติดตั้งอยู่บน `feature/ai-trader-dashboard` `3236eec` | [คู่มือสาขา][ai-trader], [สถาปัตยกรรม][ai-architecture] |
| OpenCode Go สำหรับ MT5 | ไฟล์ส่งแยกถึง `OI-Go-Wait-Reason.zip` วันที่ 25 พ.ย. ตามลำดับแพตช์จากด้านล่าง | หัวข้อ OpenCode Go ในเอกสารนี้ |
| OI Gold Management | เว็บและ EA จัดการ SL ของไม้ Manual แยกจาก Trade และ AI Trader | หัวข้อ OI Gold Management ในเอกสารนี้ |
| Pine / การวิจัย / EA ต้นแบบ | มีทั้งสคริปต์ Vela สำหรับ GC, ไฟล์ทดสอบย้อนหลัง และ EA ส่งแยก | หัวข้องานประกอบด้านล่าง |

เวอร์ชันข้างต้นอ่านจากซอร์ส ตัวเอกสาร หรือแพ็กเกจตามที่ระบุ การยืนยันบน GitHub Pages, Worker, อุปกรณ์และบัญชี MT5 ใช้หลักฐานจากแต่ละระบบ

<a name="data"></a>

## ข้อมูลออปชัน ราคา และประวัติ

| ชุดข้อมูล | ทางเดินและข้อกำหนด |
| --- | --- |
| COMEX GC Options | TradingView chain/quotes และ CME OI จาก [งาน CME](.github/workflows/cme-oi.yml) → [Worker `gcw`][gcw] → `/opt`, `/contracts` → แอป, Apps Script, Mini และ AI Trader |
| สัญญาและความสด | เลือก expiry ตาม `expTs` และบริบทวันเทรด ตรวจ root และ expiry ก่อนใช้ CME OI เก็บเวลา OI แยกจาก quote timestamp ติดป้ายเมื่อใช้ borrowed OI จากสัญญาถัดไป และตรวจการเปลี่ยนสัญญารายวันและรายเดือนตามข้อมูลจริงของ feed รวมถึงรอยต่อ DST |
| ราคา | `GC·Y` ใช้ประวัติ Yahoo GC=F และต่อปลายตามแหล่งที่กราฟกำหนด กราฟ XAUUSD ใช้ perp ที่เทียบฐานกับ Gold.F/GC ตามเส้นทาง `/px`, `/gf`, `/mix` ส่วน Trade และ EA ใช้ Bid/Ask, tick size, lot step และสกุลเงินบัญชีของโบรกเกอร์จริง |
| Raw Trades | Binance/Bitget และแหล่งสำรองตามโมดูล ใช้ trade ID กันซ้ำแยก venue แยกปริมาณตามตลาด Spot/Perp/Futures และจับคู่แท่งปิดตาม timestamp ก่อนแปลงฐานราคา |
| Backup / ประวัติ | [sync_live.gs](scripts/sync_live.gs) เก็บ snapshot ทุกชั่วโมงลง `oi_backup` พร้อม contract, เวลา, OI, Volume, Greeks, ATM IV และ EM ตามข้อมูลที่มี เก็บ payload เป็นชิ้นพร้อมตรวจ checksum และกัน snapshot ซ้ำ [oi_history_api.gs](scripts/oi_history_api.gs) อ่าน `oi_backup` และ `oi_recovered` โดยใช้วันไทย |
| Historical OI Zones | [historical-oi.js](historical-oi.js) ใช้ Top 10 เริ่มต้นและอันดับจาก OI ภายในแต่ละวัน ช่วงภาพย้อนหลังเดือน ต.ค. เริ่มจาก 12 ต.ค. ตามงานเดิม ช่วงที่ข้อมูลไม่ครบให้แสดง coverage หรือระบุวันที่ขาด ข้อมูลชีต `log` / `vol_log` เดิมต้องตรวจการกู้และความพร้อมแยกตามวัน |
| Signal log / แจ้งเตือน | [siglog.js](siglog.js) ส่งออกและอัปเดต ID เดิมตอนปิด พร้อมแยก RR/ผล เมื่อเช็ก backtest ใช้ snapshot ที่มีอยู่ ณ เวลาเกิดแผน เว็บใช้ป้ายในแอป, Web Push ผ่าน [sw.js](sw.js) และ Telegram ผ่าน Worker ตามประเภทเหตุการณ์ |

### ความหมายของค่าที่ส่งต่อ

- **OI / Volume** ใช้ดูสัญญาคงค้างและปริมาณซื้อขายราย strike จากเวลาและแหล่งของแต่ละ field แยก Call/Put และรักษาค่า null เมื่อไม่มีข้อมูล
- **IV / Skew / EM** ใน [live.js](live.js) ใช้ Black-76 และ futures reference ตาม quote ที่ผ่านเกณฑ์ Skew เทียบ Put delta −0.25 กับ Call delta +0.25 EM ใช้ ATM straddle ที่ผ่านเงื่อนไขหรือวิธีสำรองในโมดูล แสดง EM ย้อนหลังเมื่อมี ATM IV ตามข้อกำหนดของงาน
- **Gamma / GEX / Gamma Flip** คำนวณและใช้ทิศทางตามสมมติฐานในโมเดล ตรวจฐานราคาและสัญญาก่อนซ้อนลงกราฟ Max Pain คำนวณจากมูลค่า intrinsic ตอนหมดอายุถ่วงด้วย OI ความหมายของ SD ใน Mini คือการกระจาย strike ที่ถ่วงด้วย OI
- **ภาพ M5 รายวัน** ใช้แท่งต้นฉบับของวันนั้น เกณฑ์งานภาพล่าสุด OI ≥ 50 ภายในกรอบราคา ติดป้าย Call/Put นอกพื้นที่แท่งเทียน ใช้ Options Volume ที่มีหลักฐานจริง และคงเฉพาะระดับที่ตรงวัน ติดวันที่และแหล่งไว้บนภาพ สีแดงไปส้มสำหรับ Historical OI และเขียวสำหรับ OI ปัจจุบัน กริดราคาห่าง $25 ที่ 00/25/50/75 เกณฑ์ Top 10 เป็นค่าเริ่มต้นของอินดิเคเตอร์ในแอป

## กราฟและอินดิเคเตอร์

| งาน | พฤติกรรมและจุดตรวจ |
| --- | --- |
| Footprint / Volume Profile / Big Traders | [Footprint](footprint.js) นับ 24 ชม. จากแท่งล่าสุด มีแถบ Buy/Sell และ Δ ใต้แท่ง [Volume Profile](volume-profile.js) รวมไม้ทุกขนาด จัดแถวราคาได้ถึง $0.1 และคำนวณ POC ใช้ basis จากคู่แท่งที่ปิดเวลาเดียวกัน [Big Traders](bigtrade.js) ใช้เกณฑ์ปริมาณของโมดูลเอง ตรวจ iPhone ตอน cold start, backfill และการเปลี่ยน TF |
| Liquidity Heatmap | [liquidity-heatmap.js](liquidity-heatmap.js) อ่าน Binance Futures XAUUSDT order book ขณะเปิดกราฟ เก็บทุก 30 วินาที, ±$500, ช่องละ $1, สูงสุด 10 ระดับต่อฝั่ง ซิงก์ประวัติหนึ่งชั่วโมงระหว่างเครื่องที่ใช้รหัสแอปเดียวกันผ่าน [Worker](workers/liquidity) แสดง Bid เขียว/Ask ส้ม ตรวจจากเดสก์ท็อปไปมือถือและช่วงที่แท็บถูกพัก |
| Opposite Delta Diamonds | [โมดูล](opposite-delta-diamonds.js) วัด `abs(Δ)/Volume` บนแท่งปิด เก็บ Δ/Volume บนเครื่องสูงสุด 30 วัน โซนที่เกิดซ้ำแยกตามสีและ TF ต้นทาง แถบ M1–D1 แสดงข้าม TF เขียวหยุดเมื่อแท่งต้นทางปิดต่ำกว่าขอบล่างเกิน $2 ส้มหยุดเมื่อปิดเหนือขอบบนเกิน $2 |
| Dealer Box / Dealer Line | [dealerbox.js](dealerbox.js) นับ M5 ทดสอบไม่ผ่าน ค่าเริ่มต้น 3 ครั้ง ล็อกขอบเมื่อยืนยัน กรอบที่ยังทำงานอยู่พื้นขาว 10% และยื่นถึงแท่งล่าสุด +3 เมื่อแตกให้หยุดปลายเดิมและใช้เส้นประ โหมดเส้นมีกรอบทดสอบรายแท่งตามเวอร์ชัน ให้ตรวจตำแหน่ง wick บน M1 |
| DON / Envelope / EMA | [Donchian Trend](donchian-trend.js) มีไอคอนเปิดตารางบนกราฟและใช้สีส้มสำหรับ DOWN ส่วน Envelope เลือก SMA/EMA และปรับ period/deviation ได้ ตัวกรอง Envelope EMA50 ตาม TF เป็นอีกชุดค่าที่แสดงใน UI กรอบเหลือง M1 วัดขนาด body ของแท่งปิดเทียบ N แท่งก่อนหน้าและตรวจการตัด EMA50 หรือขอบ Envelope |
| TPO / H1 Range M15 Retest | [TPO](tpo.js) เริ่มวันเวลาไทย 05:00 พร้อม POC/VAH/VAL [Range Retest](range-retest.js) ล็อกกรอบ H1 จากแท่งปิด ใช้ M15 ยืนยัน, กรองข้อมูลล่าช้า ข่าว และระยะไล่ราคา แล้วแสดงเหตุผลพักสัญญาณ |
| สูตร 3 ขั้น / Trap | [oistep.js](oistep.js) ใช้การแตะโซน → CHoCH/BOS → รีเทสต์ OB/FVG ตามโหมด [trap.js](trap.js) หาแหล่งสภาพคล่องและอ่านการกวาดแล้วปิดกลับร่วมกับ absorption, Big Trades หรือ GEX ตรวจ frozen plan ก่อนแก้สูตรหรือแสดงผลย้อนหลัง |
| PWA / มือถือ | จำโหมดแท่งเทียน เส้น หรือ Footprint หลังเปิดใหม่ ปัดขวาปิดหน้าต่างที่ทับกราฟ Classic เป็น Intro เริ่มต้นและเลือก Gold Pulse ได้ ตรวจ cache/service worker กับหน้าเวอร์ชันใหม่ และตรวจว่าแถบหรือป้ายอยู่ชั้นที่ผู้ใช้เลือก |

<a name="mt5-nov-2026"></a>

## ทะเบียน EA MT5 เดือนพฤศจิกายน 2026

[ซอร์ส EA AI, runtime และแพตช์ Windows](mt5/ai-traders/README.md)

ปรับปรุงถึง **27 พฤศจิกายน 2026 เวลาไทย** ชื่อไฟล์ด้านล่างใช้ค้นงานส่งมอบเดิมได้ เลขรุ่นในคอลัมน์ไฟล์หมายถึงซอร์สหรือแพ็กเกจที่ระบุ เมื่อรับงานบนเครื่องให้จดเลข EA บนกราฟ เลขโปรแกรม Windows และรุ่นหน้าแดชบอร์ดแยกกัน

### ระบบที่เชื่อมเว็บหรือ AI

| ระบบ | จุดเริ่มงาน | การทำงานและจุดตรวจรับ |
|---|---|---|
| OI Gold AI Trader / DON | [ซอร์สแดชบอร์ด][ai-trader] · `OI_Trader_Demo.mq5` 1.21 · แพ็กเกจ RR 1.25, Trader 1.26, Dashboard 1.27.1, Ivory 1.28, DON Trend 1.29 · `OI-Gold-Start-Phone-Windows-x64.zip` | ใช้ M5, Donchian กรองฝั่ง, bridge เชื่อม MT5 กับแดชบอร์ดและ OpenCode Go เทียบ risk cap ที่ EA กับค่าที่มือถือบันทึก ทวน RR ขั้นต่ำหลังเผื่อราคาเคลื่อน และจับคู่ decision ID กับผลส่งคำสั่งใน journal |
| AI Trader SMC | `OI-Gold-SMC-Breakout-AI-Plan-Update-1.13.zip` และชุดเฉพาะ SMC ล่าสุดที่พบ `OI-Gold-SMC-Update-1.16.zip` | ใช้แผนโครงสร้างราคาและแสดงเหตุผล สิ่งที่รอ และจุดเข้า ตรวจกราฟ M5, เวลาติดต่อ EA, สิทธิ์ owner/viewer และรุ่นที่มือถือเปิดจริง เคยพบ launcher รุ่นใหม่ใช้ runtime เก่า และ Safari เปิดผลล็อกอินเป็นไฟล์ session |
| AI Trader Breakout | `OI_Trader_Breakout_v1_05.mq5` เป็นซอร์สแยกรุ่นหนึ่ง · ชุดแผนล่าสุดที่พบ `OI-Gold-SMC-Breakout-AI-Plan-Update-1.13.zip` ใช้ส่วน Breakout | M15 ต้องมีเทรนด์ก่อนเบรก ตรวจแท่งปิด M5/M15 กับกรอบก่อนแท่งนั้น แล้วรอ M5 retest ก่อนส่งแผนให้ AI กรอบสีส้มขณะรอใช้ 8 แท่งล่าสุดจึงเลื่อนตามราคาได้ ภาพวันที่ 27 พ.ย. พบ WAIT ทั้งช่วง M15 ไซด์เวย์และช่วง SELL รอกรอบ ไม่มีดีลในวันที่เลือก ยังสรุปสาเหตุของทุกแท่งจากสองภาพไม่ได้ |
| DeepSeek Gold M5 โดยตรง | `DeepSeek_Gold_M5.mq5` 1.00 · `DeepSeek_Gold_M5_Adaptive_v1_10.mq5` 1.10 | ต้นแบบเรียก API จาก EA รุ่น Adaptive เพิ่มการจัดการความเสี่ยง SL/TP และการจัดการสถานะ ตรวจสิทธิ์ WebRequest และค่าขีดจำกัดจากไฟล์ที่ติดตั้ง |
| OI Session Fade / โซน OI | [โค้ดและคู่มือ][osf] · [EA บน GitHub][osf-ea] · รุ่นส่งแยก 1.65 ตาม handoff เดิม | Worker ส่งแผนตาม session เทียบ strike กับราคาโบรกเกอร์ ทวน pending ซ้ำ อายุคำสั่ง เงื่อนไขยกเลิก และ BE ของไม้ R5 โดยใช้รหัสแผนเดียวกันทั้งเว็บและ MT5 |
| Opposite Delta Recovery | [คู่มือติดตั้ง](mt5/OPPOSITE_DELTA_SETUP.md) · [Worker](workers/opposite-delta) | อ่านสัญญาณแท่งปิด ส้ม Buy เขียว Sell แยกตะกร้าสองฝั่ง ตรวจ TP ของไม้แรกและการคำนวณ TP ถ่วงล็อตเมื่อเริ่มแก้ไม้ |
| OI Gold Management | `OI_Gold_Management_Claude_Handoff_v1_2026-11-06.md` · `OI_Manual_SL_v1.zip` | EA จัดการ SL ไม้ manual ผ่านเว็บที่แบ่งสิทธิ์ตามบัญชี Google ตรวจการคำนวณใหม่เมื่อมีไม้เพิ่มขณะปิดหน้าเว็บ การแยก Buy/Sell และการสลับผู้ใช้ |
| OI Trade Bridge / Port Sender | [Trade Bridge][bridge] · [Port Dashboard][portdash] | Bridge รับคำสั่งจาก Hub และรายงานผล ส่วน PortSender ส่ง equity, positions และ deals ให้แดชบอร์ด ตรวจเวลาและความซ้ำของคำสั่งที่ Bridge และตรวจยอดประวัติกับ MT5 ที่ Port |

### EA ที่ติดตั้งบนกราฟโดยตรง

| ไฟล์หรือชุดส่งมอบ | กติกาและกรณีที่ต้องทวน |
|---|---|
| `OI_Gold_Session_SET_1.mq5` และ `OI_Gold_Session_SET_2.mq5` 1.01 | สองโปรไฟล์สำหรับ XAUUSD บัญชี hedging ตรวจโปรไฟล์ บัญชีที่อนุญาต และนาฬิกาโบรกเกอร์ก่อนเทียบผลย้อนหลัง ข้อมูลข่าว USD ที่ฝังสำหรับ Tester ครอบคลุม 1 ต.ค.–6 พ.ย. 2026 |
| `EMA200_M1_Rebound_Basket.mq5` 1.00 | ตามฝั่ง EMA200 บน M1 รอรีบาวด์ เพิ่มไม้ตามระยะจากไม้ล่าสุด แล้วปิดกำไรรวม ตรวจระยะเป็น points และหน่วยเงินของตะกร้า |
| `Manual_Basket_Money_SL.mq5` 1.10 | SL ร่วมตามงบขาดทุนในสกุลเงินบัญชีของไม้ manual บน symbol ที่ติด EA ทดสอบเพิ่มไม้ต่างราคาแล้วคำนวณ SL ใหม่ รวมถึงการปิดฉุกเฉิน |
| `OI_Gold_Momentum_Stop_Grid.mq5` 1.00 | M1 บัญชี hedging วาง Buy Stop/Sell Stop เป็นชั้น ตรวจการจัด pending ฝั่งตรงข้ามหลังมี fill ลำดับล็อต snowball, BE, trailing และวันหมดอายุ ระยะบันไดในซอร์สใช้หน่วยราคา |
| `Envelope50_Hedge_Recovery_v1_05.mq5` 1.05 | Envelope EMA50 แยกชุดหลักและชุดแก้ ตรวจ TP ถ่วงล็อตของชุดถัดไป รวมถึงระยะขั้นต่ำระหว่างไม้หลักและระหว่างไม้แก้ |
| `SMC_M5_Recovery.mq5` 1.02 | CHoCH/BOS บน M5 มี TP และตะกร้าแก้แยกฝั่ง ไม่มี SL ตรวจ BOS หลอก การเปิดถี่ และ TP ทุกไม้ กลยุทธ์นี้รันแยกจาก SMC AI |
| `BodyCross_Envelope_EA.mq5` 1.00 | ตรวจขนาดตัวแท่งที่ตัด EMA/Envelope ตาม SignalTF ค่าเริ่มต้น M1 ใช้ไส้แท่งสัญญาณสำหรับ SL เลือก TP แบบ points หรือ ATR |
| `OI_Don_Recovery_MT5_v1_02.zip` | EA และอินดิเคเตอร์ DON ตาม TF กราฟ เปลี่ยนสีเพื่อเปิดฝั่ง ทดสอบการสะสมเศษล็อตจากตัวคูณกับ volume step ของโบรกเกอร์ |
| `Gold_Breakout_Recovery.mq5` 1.00 | เบรกกรอบเวลาตามนาฬิกาเซิร์ฟเวอร์ มี break buffer, SL/TP, โซนแก้และเป้ารวมตะกร้า ตรวจหน่วยระยะราคาและการแปลงเป้าตะกร้าเป็นเงินบัญชี แยกจาก AI Breakout ที่รอ retest |

### รับช่วงงานบนเครื่อง MT5

1. สำหรับ AI ให้เปิดโปรแกรมของกลยุทธ์และเลือกโปรไฟล์เดิม ตรวจ symbol, TF, สถานะ bridge และเวลาแท่งล่าสุดก่อนอ่านผล ใน Breakout ค่า 0 ในช่องเพดานที่ระบุ “0 = ไม่จำกัด” ต้องคงค่าเดิมหลังอัปเดต
2. ถ้าไม่มีดีล ให้ตามจากประวัติการตัดสินใจทีละแท่ง ดู WAIT และเหตุผล → แผน BUY/SELL → ผล MT5 และ retcode → ดีลใน History การประเมินที่ลงท้ายด้วย WAIT จะไม่มีตั๋วคำสั่ง
3. บนมือถือ หน้า [เชื่อมเครื่อง](ai-entry/index.html) ใช้รหัสจับคู่เพื่อหา URL ปัจจุบัน สิทธิ์ owner/viewer ตรวจที่ปลายทาง เมื่อ tunnel เปลี่ยนชื่อหรือเซสชันหมดอายุให้เข้าผ่านลิงก์ปัจจุบันแล้วล็อกอินใหม่
4. รอบนี้เป็นการส่งต่อเอกสารและระบุแหล่งไฟล์ ยังไม่มีผลคอมไพล์หรือทดสอบบัญชีโบรกเกอร์รอบใหม่ งานวิจัยกริดระดับ 00/25/50/75 และชุด backtest หลายกลยุทธ์ดูในหัวข้องานวิจัยด้านล่าง

<a name="mt5"></a>

## OI Session Fade, Trade และ MT5

### Session Fade (OI SS)

- แผน Fade ใช้ระดับจากเวลาอ้างอิง 06:00 ไทย เลือก Call/Put ใกล้ราคาและจัดเกรดด้วย Volume ตามสเปกใน [OSF handoff][osf] Time unit ของแท่ง, session, วันเทรดและ basis ต้องสอดคล้องในทุกฝั่ง Worker มี `?view=ea` สำหรับแผนกะทัดรัดและ `?view=history` สำหรับประวัติ ส่วน NY breakout ใช้เส้นทางที่ระบุในโค้ดของแต่ละตัว
- ฝั่งเว็บแยกแผนรายไม้, TP/SL, R สุทธิ และผล RR 1, 1.6, 5 ตรวจไส้ M1 ตอนเข้าและเมื่อราคาวิ่งชน SL การทดสอบเปรียบเทียบใช้เวลาแท่งจริง, รหัสแผนและฐานราคาเดียวกัน หาก SL/TP อยู่ในแท่งเดียว ใช้กฎออกที่กำหนดไว้ในตัวจำลอง
- `ea/OI_Session_Fade.mq5` บน GitHub เป็น **v1.55** ส่วนไฟล์ `OI_Session_Fade.mq5` ที่ส่งแยกอัปเดตถึง **v1.65** ก่อนเทียบผลให้จดเวอร์ชันที่ MetaTrader โหลดจริง ตรวจ pending ซ้ำ/หมดอายุ, ระยะวางและยกเลิก, GTC, money risk และ break-even ของไม้ R5 จากซอร์สเวอร์ชันนั้น บันทึกรหัสแผนเดิมไว้เทียบกับ Experts log กรณี `incorrect parameters` และรายการที่แสดงต่างจาก MT5
- ชุดทดสอบ parity ระหว่างสแกนเนอร์เว็บและ Hub ที่รีวิชันข้างต้นยังต่างกันสองกรณี จำนวนรายการ 45/43 และ 43/41 จากข้อมูลสังเคราะห์ ให้ตรวจที่เวลาปิดแท่ง การกรองและการจัดกลุ่ม session ก่อนใช้ผลเป็นฐานอ้างอิงร่วมกัน

### Trade, Port และ Mini

- Trade V0.13.00 พอร์ต DON, Footprint, TPO, Volume Profile, Liquidity Heatmap, โซน Opposite Delta ข้าม TF และรายละเอียด Session Fade ผ่าน [เครื่องมือพอร์ต][trade-port] เทียบภาพและราคาแผนกับ Pro โดยตรวจส่วนต่างราคา GC–โบรกเกอร์ ก่อนทดสอบคำสั่ง
- Trade UI → Hub `/app/cmd` → EA `/ea/sync` → สถานะและผลกลับ UI ผ่าน `/app/state` และ `/app/history` ตรวจอายุคำสั่ง 10 วินาทีที่ Hub และค่าเริ่ม `MaxCmdAgeMs` 8 วินาทีที่ EA รวมถึงความซ้ำ, scope ของ magic/symbol และล็อตสูงสุด แผน frozen ที่ใช้ร่วมกันเปิดให้ Trade อ่าน โหมดอัตโนมัติของ Hub มีการตั้งค่าแยก
- Port Dashboard รับ equity, positions และ deals จาก `PortSender.mq5` ไป `portdash/hub` สำหรับดูพอร์ตย้อนหลัง/รายวันและแยกสิทธิ์ลูกค้า ดูวิธีติดตั้งจาก [คู่มือ Port][portdash]
- Mini ใช้ ESP32-2432S028R จอ 2.8 นิ้ว, Wi-Fi, `/mini` และ `/mini/dash` ตรวจ candles fallback เมื่อเจอ `bst`, ราคา live, โซนอันดับ 1–3, ปุ่ม/ท่าทาง, การล็อกอิน และ OTA บนบอร์ดจริง ดู [Mini handoff][mini] สำหรับสเปก API, pinout และวิธีแฟลช งานเคส CYD แยกเป็นงานฮาร์ดแวร์ วัด PCB, ตำแหน่งรู M3, พอร์ต, ช่องสวิตช์และคลิปปากกากับบอร์ดจริงก่อนพิมพ์รอบต่อไป

### Opposite Delta Recovery และ OI Gold Management

- **Opposite Delta Recovery** ให้ [Worker](workers/opposite-delta) คำนวณจากแท่งปิดและ Binance Δ ตามช่วง UTC เมื่อแอปหรือ EA เรียกอ่าน โหมดส่วนกลางให้แอปกับ EA ใช้สัญญาณเดียวกัน ส้ม → Buy / เขียว → Sell จัดการฝั่งอิสระ เริ่ม TP แยกไม้และใช้ Basket TP ถ่วงล็อตเมื่อไม้แก้เข้า EA ส่ง TP พร้อมคำสั่ง ออกแบบโดยไม่มี SL และค่าเริ่มต้นปิดการเทรด ตรวจ WebRequest, TF, ราคาจาก Bid/Ask และการ rebuild basket หลังรีสตาร์ตด้วยบัญชีเดโม
- **OI Gold Management** จัดการ Stop Loss/Trailing ของไม้ Manual ผ่าน MT5 และแดชบอร์ดที่ใช้ Google Login, รายชื่ออนุมัติ และสถานะแยกผู้ใช้ รองรับระยะ points, เป้าขาดทุนเป็นเงิน/แบบรวม และ Smart จาก wick ตามโหมดที่ตั้ง งานล่าสุดที่ต้องตรวจบนคอมผู้ใช้คือเลือกบัญชี Google อื่นได้, เปิดไม้เพิ่มแล้วคำนวณ SL ใหม่แม้เว็บปิด, โหมดแยกฝั่ง Buy/Sell เทียบกับโหมดรวม และการตัดล็อตเมื่อถึงวงเงิน โปรเจกต์นี้มีเอกสารส่งต่อเดิมสำหรับเจ้าของ สิทธิ์ OAuth และการติดตั้งจริงให้ยืนยันที่ deployment ของเจ้าของ

<a name="ai"></a>

## งาน AI

| ระบบ | สิ่งที่รับช่วงต่อ |
| --- | --- |
| ในแอป OI Gold Pro | [Quant](quant.js), [ถาดวิเคราะห์](aitray.js) และ [Apps Script AI dashboard](scripts/ai_dash.gs) ใช้ OI/GEX, ราคา, flow และบริบท TF ตามข้อมูลที่มี Quant คำนวณแนวเข้า SL/TP และให้ WAIT เมื่อหลักฐานต่ำกว่าเกณฑ์ ds อธิบายเหตุผลภาษาไทยและแสดงภาวะรอ แยกสถิติ model estimate จากผลดีลจริง |
| OI Gold AI Roundtable | Windows launcher กับ UI ส่วนกลาง `ai-roundtable-ui` ใช้ manifest และ hash ของ bundle รองรับหัวข้อเดิม บทบาทผู้วิเคราะห์รวม Money Management และข้อมูล OI แบบอ่านอย่างเดียว ใช้กราฟแนบตามความสามารถของ provider งานที่ต้องเช็กต่อคือภาพกับ provider จริง, Codex CLI บน Windows, การอ่านข้อมูล OI จากมือถือ, ประวัติและการคงตำแหน่งหน้าจอระหว่างคำตอบไหลเข้า |
| OI Gold AI Trader | สาขา [feature/ai-trader-dashboard][ai-trader] รัน local Node บนเครื่อง MT5 รับ `/opt` และ Binance flow ของ M5 ที่ปิดแล้วตาม coverage ตั้ง risk cap ใน dashboard และ EA ใช้ข้อจำกัดที่เข้มกว่า แสดงเหตุผลและบันทึก decision ID เชื่อมกับ journal ดีลรายวัน ชุดทดสอบ Node ผ่าน ให้บันทึกผล MetaEditor, MT5/โบรกเกอร์ และการเข้ามือถือจากเครื่องใช้งานจริง |
| OpenCode Go / WAIT reasons | ลำดับไฟล์ Windows ที่ส่งแยกคือ `OI-OpenCode-Go.zip` → `OI-Go-Decision-Live.zip` → `OI-Go-Decision-Details.zip` → `OI-Go-Wait-Reason.zip` แพตช์ท้ายอธิบายว่า WAIT เพราะอะไรและจะประเมินเมื่อใด เช่น แท่ง M5 ปิดเทียบเส้นกลาง/ขอบ DON, Δ ที่ยังไม่สนับสนุน หรือข้อมูลรอบนั้นขาด แพ็กเกจรุ่นรายละเอียดแนบค่าจาก OI/Gamma/ATM IV เมื่อมีข้อมูล ยืนยันแพตช์ที่ติดตั้งจริงกับไฟล์ runtime บน Windows และแยกสถานะ decision ออกจากผล fill ของโบรกเกอร์ |
| DeepSeek Gold M5 Adaptive | ไฟล์ EA ต้นแบบ `DeepSeek_Gold_M5_Adaptive_v1_10.mq5` สำหรับ SL/TP, ลดล็อตและ Risk Controller ส่งแยกจาก AI Trader Dashboard ตรวจ MetaEditor และผลจาก Demo ก่อนประเมินพฤติกรรมการส่งคำสั่ง |

## Pine, การวิจัย และ EA ต้นแบบ

- **Vela / GC COMEX** ใช้ฟีด GC ของ Vela กับ Pine เช่น `OI_Gold_Pro_GC_Footprint_Vela_v1.0.pine`, Volume Profile และ GC Order Flow Toolkit ทดสอบ layer ของแท่งเทียนกับแถบ Volume และ Δ โดยตรวจ data coverage ของ platform
- **กลยุทธ์และ EA ส่งแยก** มี Body Cross EMA/Envelope, Envelope50 Hedge Recovery, SMC M5 Recovery, EMA200 M1 Rebound Basket, Momentum Stop Grid และ Manual Basket Money SL งานเหล่านี้มีพารามิเตอร์, Magic Number, เงื่อนไข recovery และชุดดีลของตนเอง ให้บันทึกชื่อไฟล์และเวอร์ชันก่อนเทียบกับ EA เชื่อมแอป
- **Backtest** เก็บชุดทดสอบ OI/Volume, Session Fade, Big Trade และ XAUUSD หลายกลยุทธ์ ระบุวันไทย/วันโบรกเกอร์, coverage, snapshot ที่รู้ได้ขณะเทรด, spread/slippage, contract size, ค่า point, RR, PF, drawdown และจำนวน TP/SL เสมอ กริด $25, breakout และแนวคิดที่ยังวิจัยให้ติดชื่อชุดทดสอบแยกจากกลยุทธ์ที่อยู่ในซอร์ส

<a name="checks"></a>

## การดูแลและผลทดสอบรอบส่งต่อ

1. เริ่มจาก `main` และ changelog ของรีโปที่แก้ ถ้าเป็นงาน runtime ให้เพิ่มเวอร์ชันแอปและ cache ของไฟล์ที่เกี่ยวข้องตามกติการีโป Trade ใช้กระบวนการพอร์ตที่เก็บส่วนต่างราคาและ Hub/EA ไว้
2. เว็บ Pro และ Trade ใช้ GitHub Pages Worker ข้อมูล, Trade Hub, Port และเฟิร์มแวร์ใช้ workflows ของ Trade repo Apps Script ต้องตรวจเวอร์ชันที่เผยแพร่และ trigger รายชั่วโมง คีย์และรหัสเข้าถึงตั้งใน secret store หรือ runtime ของเจ้าของ
3. เมื่อติดตามข้อมูลสดให้เทียบ root/expiry, OI/quote timestamp, การแปลง basis, chart TF และ broker symbol พร้อมกัน ตรวจวันเปลี่ยน DST, วันหมดอายุ, สภาพตลาดปิด และ OI ที่กู้ได้บางส่วน
4. ก่อนเปลี่ยนพฤติกรรม EA ให้ตรวจ MetaEditor และบัญชี Demo ด้วยกรณีออฟไลน์, คำสั่งซ้ำ/หมดอายุ, pending ถูกปฏิเสธ, ล็อตขั้นต่ำ, หลายไม้, BUY/SELL พร้อมกัน, การรีสตาร์ต EA และผลต่างระหว่างแผนกับ fill ของโบรกเกอร์

| ตรวจบนซอร์สรอบนี้ | ผล |
| --- | --- |
| Pro | ชุด Dealer Box, Volume Profile, raw feed, mobile cold start, Opposite Delta และ Range Retest ผ่าน |
| Trade / Worker | ชุดทดสอบ GC Worker, Trade Hub (53), Auto, การพอร์ต และ Port Dashboard (12 สำหรับ UI, 31 สำหรับ Hub) ผ่าน |
| Session Fade parity | ชุด `tools/test-osf.mjs` เทียบ Pro/Hub ให้ผลต่างสองกรณี จำนวนตรวจ pending 339 คู่และตัวตรวจส่วนนี้รายงาน mismatch 0 |
| AI Trader | ชุด demo และ OI snapshot ผ่าน 5 เทสต์บนสาขา `feature/ai-trader-dashboard` |
| Roundtable | ตรวจ SHA-256 ของ bundle ตาม manifest v1.0.7 ผ่าน ชุดทดสอบ launcher ต้องใช้ไฟล์ build เพิ่มและยังไม่ได้ยืนยันในรอบนี้ |
| Production / อุปกรณ์ | การทดสอบรอบนี้อยู่ที่ซอร์สและข้อมูลจำลอง ยังไม่มีผลตรวจสดรอบใหม่สำหรับ iPhone ข้ามเครื่อง, Apps Script จริง, Windows launcher, MetaEditor, MT5/โบรกเกอร์ หรือบอร์ด Mini |

[pro-app]: https://oi-gold-pro.github.io/gold-oi-pro/
[trade-app]: https://oi-gold-pro.github.io/gold-oi-trade/
[trade-repo]: https://github.com/OI-GOLD-PRO/gold-oi-trade
[trade-log]: https://github.com/OI-GOLD-PRO/gold-oi-trade/blob/main/CHANGELOG.md
[gcw]: https://github.com/OI-GOLD-PRO/gold-oi-trade/tree/main/gcw
[hub]: https://github.com/OI-GOLD-PRO/gold-oi-trade/tree/main/hub
[bridge]: https://github.com/OI-GOLD-PRO/gold-oi-trade/blob/main/ea/OI_Trade_Bridge.mq5
[mini]: https://github.com/OI-GOLD-PRO/gold-oi-trade/blob/main/mini/HANDOFF.md
[portdash]: https://github.com/OI-GOLD-PRO/gold-oi-trade/blob/main/portdash/README.md
[osf]: https://github.com/OI-GOLD-PRO/gold-oi-trade/blob/main/ea/OSF_HANDOFF.md
[osf-ea]: https://github.com/OI-GOLD-PRO/gold-oi-trade/blob/main/ea/OI_Session_Fade.mq5
[trade-port]: https://github.com/OI-GOLD-PRO/gold-oi-trade/blob/main/tools/port.py
[ai-trader]: https://github.com/OI-GOLD-PRO/gold-oi-pro/blob/feature/ai-trader-dashboard/ai-trader/README.md
[ai-architecture]: https://github.com/OI-GOLD-PRO/gold-oi-pro/blob/feature/ai-trader-dashboard/ai-trader/ARCHITECTURE.md
