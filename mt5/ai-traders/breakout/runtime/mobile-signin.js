const form = document.querySelector('form');
const button = form.querySelector('button');
const message = document.querySelector('[role="alert"]');
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  message.textContent = 'กำลังเข้าสู่ระบบ…';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const options = {credentials:'same-origin', cache:'no-store', signal:controller.signal};
    const result = await fetch(form.dataset.login, {...options, method:'POST', body:new URLSearchParams(new FormData(form))});
    if (result.headers.get('X-OI-Login') === 'ok' && result.ok) {
      const check = await fetch('/', options);
      if (check.ok && check.headers.get('X-OI-Dashboard') === '1') {
        location.replace('/');
        return;
      }
      message.textContent = 'ยืนยันการเข้าสู่ระบบไม่ได้ กรุณาเปิดลิงก์ตรงปัจจุบันใน Safari และอนุญาตคุกกี้';
    } else {
      const errors = {401:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',403:'กรุณาเปิดลิงก์ตรงปัจจุบันจากโปรแกรมบนคอม',429:'ลองหลายครั้งเกินไป กรุณารอสักครู่'};
      message.textContent = errors[result.status] || 'เชื่อมต่อไม่ได้ กรุณาตรวจลิงก์ตรงในโปรแกรมบนคอม';
    }
  } catch {
    message.textContent = 'ติดต่อแดชบอร์ดไม่ได้ กรุณาตรวจลิงก์ตรงในโปรแกรมบนคอม';
  } finally {
    clearTimeout(timer);
    button.disabled = false;
  }
});
button.disabled = false;
