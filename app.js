/**
 * AURORA QUANTUM OS — Complete School ERP & Management Logic
 * IndexedDB Local Database Engine & Application Controller
 */

const DB_NAME = 'EduCoreAuroraFlagship_v9';
let db = null;
let students = [];
let cashbook = [];
let staffList = [];
let utilities = [];
let auditLogs = [];
let attendanceMap = {};

let currentPhoto = '';
let selectedCNIC = '';
let stuPage = 1;
let feePage = 1;
let currentUserRole = '';
let currentUsername = '';
let loggedInTeacherId = '';
let failedAttempts = 0;
let lockoutUntil = 0;
let inactivityTimer = null;
let activeGeneratedOTP = '';
const PAGE_SIZE = 50;

let schoolBrand = {
  initialized: false,
  name: 'EDUCORE INTERNATIONAL CAMPUS',
  tagline: 'Main GT Road Campus, Islamabad | Ph: 051-8899112',
  bank: 'HBL Islamic Banking — A/C # 0042-79001234-03',
  logo: '',
  bg: '',
  adminUser: '',
  adminPass: '',
  cashierUser: '',
  cashierPass: '',
  recoveryEmail: '',
  recoveryPhone: '',
  masterKey: ''
};

// Initialize default dates
const todayStr = new Date().toISOString().split('T')[0];
window.addEventListener('DOMContentLoaded', () => {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal('attDate', todayStr);
  setVal('cDate', todayStr);
  setVal('uDueDate', todayStr);
  setVal('slcLeaveDate', todayStr);
});

// Real-time clock in top intro header
setInterval(() => {
  const el = document.getElementById('liveIntroClock');
  if (el) {
    el.textContent = `AURORA QUANTUM OS • ${new Date().toLocaleDateString()} • ${new Date().toLocaleTimeString()}`;
  }
}, 1000);

function toggleSidebar() {
  document.getElementById('mainSidebar').classList.toggle('collapsed');
}

function togglePrivacyBlur() {
  document.body.classList.toggle('privacy-blur');
  const on = document.body.classList.contains('privacy-blur');
  const lbl = document.getElementById('sidePrivacyLabel');
  if (lbl) lbl.textContent = on ? 'Blur: ON' : 'Blur: OFF';
}

function logAuditEvent(actionText) {
  if (!db) return;
  const entry = {
    id: 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    time: new Date().toLocaleString(),
    user: `${currentUsername || 'System'} (${currentUserRole || 'Auth'})`,
    action: actionText
  };
  auditLogs.unshift(entry);
  const tx = db.transaction('audit', 'readwrite');
  tx.objectStore('audit').put(entry);
  renderAuditLogs();
}

function renderAuditLogs() {
  const el = document.getElementById('auditLogBody');
  if (!el) return;
  el.innerHTML = auditLogs.slice(0, 60).map(a => `
    <tr><td>${a.time}</td><td><strong>${a.user}</strong></td><td>${a.action}</td></tr>
  `).join('');
}

function resetInactivityWatchdog() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (document.getElementById('introScreen') && document.getElementById('introScreen').classList.contains('hidden')) {
      lockSession();
    }
  }, 10 * 60 * 1000);
}
['mousemove', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, resetInactivityWatchdog));

function maskEmail(em) {
  if (!em || !em.includes('@')) return 'Not Linked';
  const [u, d] = em.split('@');
  return u.slice(0, 2) + '***@' + d;
}

function maskPhone(ph) {
  if (!ph || ph.length < 6) return 'Not Linked';
  return ph.slice(0, 4) + '-****' + ph.slice(-3);
}

// --- FIRST-TIME SETUP, NAMED LOGIN & EMAIL/PHONE OTP RECOVERY ---
function updateIntroAuthView() {
  document.getElementById('forgotRecoveryBox').style.display = 'none';
  if (!schoolBrand.initialized || !schoolBrand.adminUser) {
    document.getElementById('firstTimeSetupBox').style.display = 'block';
    document.getElementById('standardLoginBox').style.display = 'none';
  } else {
    document.getElementById('firstTimeSetupBox').style.display = 'none';
    document.getElementById('standardLoginBox').style.display = 'block';
  }
}

function completeFirstTimeSetup() {
  const sName = document.getElementById('initSchoolName').value.trim();
  const aUser = document.getElementById('initAdminUser').value.trim();
  const aPass = document.getElementById('initAdminPass').value.trim();
  const cUser = document.getElementById('initCashierUser').value.trim();
  const cPass = document.getElementById('initCashierPass').value.trim();
  const rEmail = document.getElementById('initRecEmail').value.trim();
  const rPhone = document.getElementById('initRecPhone').value.trim();
  const mKey = document.getElementById('initMasterKey').value.trim();

  if (!sName || !aUser || !aPass || !cUser || !cPass || !rEmail || !rPhone || !mKey) {
    alert('Please complete all fields including your Linked Recovery Email, Phone Number, and Master Key.');
    return;
  }

  schoolBrand.initialized = true;
  schoolBrand.name = sName;
  schoolBrand.adminUser = aUser;
  schoolBrand.adminPass = aPass;
  schoolBrand.cashierUser = cUser;
  schoolBrand.cashierPass = cPass;
  schoolBrand.recoveryEmail = rEmail;
  schoolBrand.recoveryPhone = rPhone;
  schoolBrand.masterKey = mKey;

  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ key: 'branding', ...schoolBrand });
  tx.oncomplete = () => {
    applyBrandingToUI();
    updateIntroAuthView();
    logAuditEvent('Initial System Security & Linked Recovery Email/Phone Configured');
    alert('Security Setup Complete! Log in with your custom Username and Password.');
  };
}

function openForgotRecoveryBox() {
  document.getElementById('standardLoginBox').style.display = 'none';
  document.getElementById('forgotRecoveryBox').style.display = 'block';
  document.getElementById('otpDispatchStatus').style.display = 'none';
  document.getElementById('recoveryTargetInfo').innerHTML =
    `Linked Admin Email: <strong>${maskEmail(schoolBrand.recoveryEmail)}</strong> &nbsp;|&nbsp; Linked Phone: <strong>${maskPhone(schoolBrand.recoveryPhone)}</strong>`;
}

function closeForgotRecoveryBox() {
  document.getElementById('forgotRecoveryBox').style.display = 'none';
  document.getElementById('standardLoginBox').style.display = 'block';
}

function dispatchOTP(channel) {
  activeGeneratedOTP = String(Math.floor(100000 + Math.random() * 900000));
  const statusEl = document.getElementById('otpDispatchStatus');
  statusEl.style.display = 'block';

  if (channel === 'whatsapp') {
    const msg = `*${schoolBrand.name} — SECURITY RECOVERY OTP*\nYour 6-Digit Password Reset Code is: *${activeGeneratedOTP}*\nRequested at: ${new Date().toLocaleTimeString()}\nDo not share this code with anyone.`;
    openWhatsAppMsg(schoolBrand.recoveryPhone, msg);
    statusEl.textContent = `6-Digit OTP dispatched to your linked WhatsApp (${maskPhone(schoolBrand.recoveryPhone)}). Enter the code below.`;
  } else {
    const subject = encodeURIComponent(`${schoolBrand.name} - Password Recovery Code`);
    const body = encodeURIComponent(`SECURITY RECOVERY CODE\n\nSchool: ${schoolBrand.name}\nYour 6-Digit Password Reset OTP is: ${activeGeneratedOTP}\n\nEnter this 6-digit code in the ERP Recovery Box to set your new password.`);
    window.open(`mailto:${schoolBrand.recoveryEmail}?subject=${subject}&body=${body}`, '_blank');
    statusEl.textContent = `6-Digit OTP dispatched to your linked Email (${maskEmail(schoolBrand.recoveryEmail)}).`;
  }
  logAuditEvent(`Password Recovery OTP Dispatched via ${channel.toUpperCase()}`);
}

function verifyOTPAndResetPassword() {
  const role = document.getElementById('recTargetRole').value;
  const enteredCode = document.getElementById('recOtpInput').value.trim();
  const newU = document.getElementById('recNewUsername').value.trim();
  const newP = document.getElementById('recNewPassword').value.trim();

  if (!enteredCode || !newU || !newP) {
    alert('Please enter the 6-Digit OTP (or Master Key), Username, and New Password.');
    return;
  }

  const isOtpMatch = activeGeneratedOTP && enteredCode === activeGeneratedOTP;
  const isMasterMatch = schoolBrand.masterKey && enteredCode === schoolBrand.masterKey;

  if (!isOtpMatch && !isMasterMatch) {
    alert('Invalid Recovery Code! Check the 6-digit OTP sent to your linked Email/WhatsApp or enter your Master Emergency Key.');
    return;
  }

  if (role === 'Principal') {
    schoolBrand.adminUser = newU;
    schoolBrand.adminPass = newP;
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'branding', ...schoolBrand });
    tx.oncomplete = () => {
      activeGeneratedOTP = '';
      logAuditEvent(`Principal Password Reset via OTP Recovery (New Username: ${newU})`);
      alert(`Principal credentials updated! New Username: ${newU}`);
      closeForgotRecoveryBox();
    };
  } else if (role === 'Accountant') {
    schoolBrand.cashierUser = newU;
    schoolBrand.cashierPass = newP;
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'branding', ...schoolBrand });
    tx.oncomplete = () => {
      activeGeneratedOTP = '';
      logAuditEvent(`Cashier Password Reset via OTP Recovery (New Username: ${newU})`);
      alert(`Cashier credentials updated! New Username: ${newU}`);
      closeForgotRecoveryBox();
    };
  } else if (role === 'Teacher') {
    const st = staffList.find(x => (x.username && x.username.toLowerCase() === newU.toLowerCase()) || (x.empNo && x.empNo.toLowerCase() === newU.toLowerCase()));
    if (!st) {
      alert('No Teacher found with that Username or Employee ID!');
      return;
    }
    st.password = newP;
    const tx = db.transaction('staff', 'readwrite');
    tx.objectStore('staff').put(st);
    tx.oncomplete = () => {
      activeGeneratedOTP = '';
      loadAllData();
      logAuditEvent(`Teacher Password Reset via OTP for ${st.name}`);
      alert(`Password reset complete for Teacher: ${st.name} (${st.username})!`);
      closeForgotRecoveryBox();
    };
  }
}

function attemptLogin() {
  const errEl = document.getElementById('loginErrorMsg');
  const now = Date.now();
  if (now < lockoutUntil) {
    errEl.style.display = 'block';
    errEl.textContent = `Terminal locked due to failed attempts. Wait ${Math.ceil((lockoutUntil - now)/1000)}s.`;
    return;
  }

  const role = document.getElementById('loginRole').value;
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  let authenticated = false;
  loggedInTeacherId = '';

  if (role === 'Principal') {
    if (u.toLowerCase() === (schoolBrand.adminUser || '').toLowerCase() && p === schoolBrand.adminPass) authenticated = true;
  } else if (role === 'Accountant') {
    if (u.toLowerCase() === (schoolBrand.cashierUser || '').toLowerCase() && p === schoolBrand.cashierPass) authenticated = true;
  } else if (role === 'Teacher') {
    const matchedTeacher = staffList.find(st =>
      (st.username && st.username.toLowerCase() === u.toLowerCase() && st.password === p) ||
      (st.empNo && st.empNo.toLowerCase() === u.toLowerCase() && st.password === p)
    );
    if (matchedTeacher) {
      authenticated = true;
      loggedInTeacherId = matchedTeacher.id;
    }
  }

  if (!authenticated) {
    failedAttempts++;
    errEl.style.display = 'block';
    if (failedAttempts >= 3) {
      lockoutUntil = Date.now() + 30000;
      failedAttempts = 0;
      errEl.textContent = '3 failed login attempts! Terminal locked for 30 seconds.';
    } else {
      errEl.textContent = `Invalid Username or Password for ${role} (${3 - failedAttempts} tries remaining).`;
    }
    return;
  }

  failedAttempts = 0;
  errEl.style.display = 'none';
  currentUserRole = role;
  currentUsername = u;
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  applyRolePermissions();
  document.getElementById('introScreen').classList.add('hidden');
  logAuditEvent(`Successful Login by ${currentUsername} (${currentUserRole})`);
  resetInactivityWatchdog();
}

function lockSession() {
  document.getElementById('introScreen').classList.remove('hidden');
  document.getElementById('loginPassword').value = '';
  updateIntroAuthView();
}

function applyRolePermissions() {
  document.getElementById('activeRoleBadge').textContent = `${currentUserRole.toUpperCase()}: ${currentUsername}`;
  document.getElementById('sessionUserPill').textContent = `User: ${currentUsername} (${currentUserRole})`;
  document.getElementById('linkedSecurityPill').textContent = `Recovery Linked: ${maskPhone(schoolBrand.recoveryPhone)}`;
  document.getElementById('heroRoleGreeting').textContent = `ACTIVE USER: ${currentUsername.toUpperCase()} (${currentUserRole.toUpperCase()})`;

  const isAdmin = currentUserRole === 'Principal';
  const isFinance = currentUserRole === 'Principal' || currentUserRole === 'Accountant';
  const isTeacherOnly = currentUserRole === 'Teacher';

  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
  document.querySelectorAll('.finance-only').forEach(el => el.style.display = isFinance ? '' : 'none');

  if (isTeacherOnly) {
    switchTab('teacherportal', document.getElementById('nav-teacherportal'));
    renderTeacherSelfPortal();
  } else {
    switchTab('dashboard', document.getElementById('nav-dashboard'));
    renderStudents();
  }
}

// --- AVATARS & BRANDING ---
function makeDefaultLogoSVG(schoolName) {
  const init = (schoolName || 'EC').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#0f172a" stroke="#00f2fe" stroke-width="6"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#00f2fe" font-family="Segoe UI,sans-serif" font-size="42" font-weight="800">${init}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function makeDefaultBgSVG() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#030712"/><circle cx="1300" cy="200" r="320" fill="rgba(0,242,254,0.08)"/><circle cx="300" cy="700" r="380" fill="rgba(168,85,247,0.08)"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function makeAvatar(name, roll) {
  const clean = (name || 'Student').trim();
  const parts = clean.split(/\s+/);
  const init = ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
  const palette = ['#0284c7','#059669','#d97706','#7c3aed','#e11d48','#0d9488'];
  let h = 0; const s = clean + (roll || '');
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const bg = palette[Math.abs(h) % palette.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="16" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="Segoe UI,sans-serif" font-size="32" font-weight="700">${init}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function getPic(s) {
  return s.photo && s.photo.startsWith('data:image') ? s.photo : makeAvatar(s.name, s.roll);
}

function applyBrandingToUI() {
  const logoSrc = schoolBrand.logo || makeDefaultLogoSVG(schoolBrand.name);
  const bgSrc = schoolBrand.bg || makeDefaultBgSVG();
  document.getElementById('introSchoolName').textContent = schoolBrand.name;
  document.getElementById('introSchoolTagline').textContent = schoolBrand.tagline;
  document.getElementById('introLogoImg').src = logoSrc;
  document.getElementById('introScreen').style.backgroundImage = `url('${bgSrc}')`;
  document.getElementById('sideSchoolName').textContent = schoolBrand.name;
  document.getElementById('sideLogoImg').src = logoSrc;
  document.getElementById('heroSchoolName').textContent = schoolBrand.name;
  document.getElementById('heroSchoolTagline').textContent = `${schoolBrand.tagline} | Bank: ${schoolBrand.bank || 'HBL'}`;
  document.getElementById('heroLogoImg').src = logoSrc;
  document.getElementById('dashboardHeroBanner').style.backgroundImage = `url('${bgSrc}')`;
  document.getElementById('appBody').style.backgroundImage = `url('${bgSrc}')`;
}

function openBrandingModal() {
  if (currentUserRole !== 'Principal') {
    alert('Restricted: Only Principal can modify branding & security accounts.');
    return;
  }
  document.getElementById('brandingModal').classList.add('open');
  document.getElementById('bSchoolName').value = schoolBrand.name;
  document.getElementById('bSchoolTagline').value = schoolBrand.tagline;
  document.getElementById('bBankName').value = schoolBrand.bank || '';
  document.getElementById('bAdminUser').value = schoolBrand.adminUser || '';
  document.getElementById('bAdminPass').value = schoolBrand.adminPass || '';
  document.getElementById('bCashierUser').value = schoolBrand.cashierUser || '';
  document.getElementById('bCashierPass').value = schoolBrand.cashierPass || '';
  document.getElementById('bRecEmail').value = schoolBrand.recoveryEmail || '';
  document.getElementById('bRecPhone').value = schoolBrand.recoveryPhone || '';
  document.getElementById('bMasterKey').value = schoolBrand.masterKey || '';
}

function handleSchoolLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 180; c.height = 180;
      const sz = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width-sz)/2, (img.height-sz)/2, sz, sz, 0, 0, 180, 180);
      schoolBrand.logo = c.toDataURL('image/jpeg', 0.85);
    };
    img.src = ev.target.result;
  };
  r.readAsDataURL(file);
}

function handleSchoolBgUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      c.getContext('2d').drawImage(img, 0, 0, 1280, 720);
      schoolBrand.bg = c.toDataURL('image/jpeg', 0.82);
    };
    img.src = ev.target.result;
  };
  r.readAsDataURL(file);
}

function saveBrandingSettings() {
  schoolBrand.name = document.getElementById('bSchoolName').value.trim() || 'EDUCORE INTERNATIONAL CAMPUS';
  schoolBrand.tagline = document.getElementById('bSchoolTagline').value.trim() || 'Main Campus';
  schoolBrand.bank = document.getElementById('bBankName').value.trim() || 'HBL Islamic A/C # 0042-79001234-03';
  schoolBrand.adminUser = document.getElementById('bAdminUser').value.trim() || schoolBrand.adminUser;
  schoolBrand.adminPass = document.getElementById('bAdminPass').value.trim() || schoolBrand.adminPass;
  schoolBrand.cashierUser = document.getElementById('bCashierUser').value.trim() || schoolBrand.cashierUser;
  schoolBrand.cashierPass = document.getElementById('bCashierPass').value.trim() || schoolBrand.cashierPass;
  schoolBrand.recoveryEmail = document.getElementById('bRecEmail').value.trim() || schoolBrand.recoveryEmail;
  schoolBrand.recoveryPhone = document.getElementById('bRecPhone').value.trim() || schoolBrand.recoveryPhone;
  schoolBrand.masterKey = document.getElementById('bMasterKey').value.trim() || schoolBrand.masterKey;
  schoolBrand.initialized = true;

  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ key: 'branding', ...schoolBrand });
  tx.oncomplete = () => {
    applyBrandingToUI();
    applyRolePermissions();
    closeModal('brandingModal');
    logAuditEvent('Updated School Branding & Security Settings');
  };
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 120; c.height = 120;
      const sz = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width-sz)/2, (img.height-sz)/2, sz, sz, 0, 0, 120, 120);
      currentPhoto = c.toDataURL('image/jpeg', 0.8);
      document.getElementById('fPicPreview').src = currentPhoto;
    };
    img.src = ev.target.result;
  };
  r.readAsDataURL(file);
}

function updateAvatarPreview() {
  if (!currentPhoto) {
    document.getElementById('fPicPreview').src = makeAvatar(
      document.getElementById('fName').value,
      document.getElementById('fRoll').value
    );
  }
}

function initDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('students')) d.createObjectStore('students', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('cashbook')) d.createObjectStore('cashbook', { keyPath: 'txId' });
      if (!d.objectStoreNames.contains('staff')) d.createObjectStore('staff', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('utilities')) d.createObjectStore('utilities', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('audit')) d.createObjectStore('audit', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('attendance')) d.createObjectStore('attendance', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = (e) => { db = e.target.result; res(); };
    req.onerror = (e) => rej(e);
  });
}

async function loadAllData() {
  const tx = db.transaction(['students', 'cashbook', 'staff', 'utilities', 'audit', 'attendance', 'settings'], 'readonly');
  students = await new Promise(r => { const q = tx.objectStore('students').getAll(); q.onsuccess = () => r(q.result || []); });
  cashbook = await new Promise(r => { const q = tx.objectStore('cashbook').getAll(); q.onsuccess = () => r(q.result || []); });
  staffList = await new Promise(r => { const q = tx.objectStore('staff').getAll(); q.onsuccess = () => r(q.result || []); });
  utilities = await new Promise(r => { const q = tx.objectStore('utilities').getAll(); q.onsuccess = () => r(q.result || []); });
  auditLogs = await new Promise(r => { const q = tx.objectStore('audit').getAll(); q.onsuccess = () => r(q.result || []); });
  const att = await new Promise(r => { const q = tx.objectStore('attendance').getAll(); q.onsuccess = () => r(q.result || []); });
  const savedBrand = await new Promise(r => { const q = tx.objectStore('settings').get('branding'); q.onsuccess = () => r(q.result || null); });

  if (savedBrand) schoolBrand = { ...schoolBrand, ...savedBrand };
  applyBrandingToUI();
  updateIntroAuthView();

  students.sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));
  cashbook.sort((a, b) => b.timestamp - a.timestamp);
  auditLogs.sort((a, b) => b.id.localeCompare(a.id));
  attendanceMap = {};
  att.forEach(a => attendanceMap[a.key] = a);
  refreshAll();
}

function refreshAll() {
  renderDashboard();
  renderFamilySearch();
  renderStudents();
  renderFees();
  renderCashbook();
  renderStaffPayroll();
  renderTeacherSelfPortal();
  renderUtilities();
  renderAttendance();
  renderExams();
  renderAuditLogs();
}

function switchTab(tab, el) {
  if (currentUserRole === 'Teacher' && tab !== 'teacherportal') {
    alert('Restricted: Teacher accounts only have access to their personal Salary & Bank Portal.');
    return;
  }
  document.querySelectorAll('.nav li').forEach(li => li.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('view-' + tab);
  if (target) target.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function getFeeStatus(s) {
  const b = Number(s.balance) || 0;
  const p = Number(s.totalPaid) || 0;
  return b <= 0 ? 'Paid' : (p > 0 ? 'Partial' : 'Pending');
}

// --- WHATSAPP HELPER ---
function openWhatsAppMsg(phoneRaw, messageText) {
  let clean = (phoneRaw || '').replace(/[^0-9]/g, '');
  if (clean.startsWith('03')) clean = '92' + clean.slice(1);
  else if (clean.startsWith('3') && clean.length === 10) clean = '92' + clean;
  else if (!clean.startsWith('92')) clean = '923001234567';
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(messageText)}`, '_blank');
}

function sendStudentWhatsAppFee(stuId) {
  const s = students.find(x => x.id === stuId);
  if (!s) return;
  const msg = `*${schoolBrand.name}*\nDear *${s.father}* (CNIC: ${s.cnic}),\nReminder regarding *${s.name}* (Roll No: *${s.roll}*, Class *${s.classNum}-${s.section}*).\n*Pending Balance:* Rs *${Number(s.balance).toLocaleString()}*\nBank: ${schoolBrand.bank}`;
  openWhatsAppMsg(s.phone, msg);
}

function sendFamilyWhatsAppReminder() {
  const fam = getFamiliesMap()[selectedCNIC];
  if (!fam) return;
  const kidsList = fam.children.map(c => `- ${c.name} (${c.roll}, Class ${c.classNum}): Due Rs ${c.balance}`).join('\n');
  const msg = `*${schoolBrand.name}*\n*FAMILY FEE REMINDER*\nDear *${fam.father}* (CNIC: ${fam.cnic}),\n${kidsList}\n*Combined Family Due:* Rs *${fam.totalDue.toLocaleString()}*`;
  openWhatsAppMsg(fam.phone, msg);
}

function sendAbsentWhatsApp(stuId, date) {
  const s = students.find(x => x.id === stuId);
  if (!s) return;
  openWhatsAppMsg(s.phone, `*${schoolBrand.name} — ATTENDANCE ALERT*\nDear *${s.father}*, your child *${s.name}* (${s.roll}) was marked *ABSENT* on ${date}.`);
}

// --- 1. DASHBOARD & VISUAL ANALYTICS ---
function renderDashboard() {
  const cnicSet = new Set();
  let pendingFee = 0;
  let paidStudentsCount = 0;
  const clsMap = {};
  for (let c = 1; c <= 10; c++) clsMap[c] = { count: 0, b: 0, g: 0, paid: 0, due: 0, billed: 0, dueRs: 0 };

  students.forEach(s => {
    if (s.cnic) cnicSet.add(s.cnic);
    const bal = Number(s.balance) || 0;
    if (bal <= 0) paidStudentsCount++; else pendingFee += bal;
    const c = clsMap[s.classNum] || clsMap[1];
    c.count++;
    if (s.gender === 'Male') c.b++; else c.g++;
    if (bal <= 0) c.paid++; else c.due++;
    c.billed += (Number(s.fee) || 0);
    c.dueRs += bal;
  });

  let totalIn = 0;
  let totalOut = 0;
  cashbook.forEach(tx => {
    if (tx.type === 'IN') totalIn += (Number(tx.amount) || 0);
    else totalOut += (Number(tx.amount) || 0);
  });
  const unpaidUtil = utilities.filter(u => u.status !== 'Paid').reduce((s, u) => s + (Number(u.amount) || 0), 0);

  document.getElementById('dTotalStu').textContent = students.length.toLocaleString();
  document.getElementById('dTotalFam').textContent = `${cnicSet.size.toLocaleString()} Families (CNICs)`;
  document.getElementById('dCashIn').textContent = `Rs ${totalIn.toLocaleString()}`;
  document.getElementById('dCashOut').textContent = `Rs ${totalOut.toLocaleString()}`;
  document.getElementById('dNetCash').textContent = `Rs ${(totalIn - totalOut).toLocaleString()}`;
  document.getElementById('dPendingUtil').textContent = `Rs ${unpaidUtil.toLocaleString()}`;
  document.getElementById('dPendingFeeSub').textContent = `Pending Fee Dues: Rs ${pendingFee.toLocaleString()}`;

  const feePct = students.length > 0 ? Math.round((paidStudentsCount / students.length) * 100) : 0;
  document.getElementById('barFeePct').textContent = `${feePct}% Paid`;
  document.getElementById('barFeeFill').style.width = `${feePct}%`;

  const cashPct = (totalIn + totalOut) > 0 ? Math.round((totalIn / (totalIn + totalOut)) * 100) : 100;
  document.getElementById('barCashPct').textContent = `${cashPct}% Inflow Ratio`;
  document.getElementById('barCashFill').style.width = `${cashPct}%`;

  document.getElementById('classSummaryBody').innerHTML = Object.keys(clsMap).map(k => {
    const d = clsMap[k];
    return `<tr>
      <td><strong>Class ${k}</strong></td><td>${d.count}</td><td>${d.b} B / ${d.g} G</td>
      <td><span class="badge bg-green">${d.paid} Paid</span></td>
      <td><span class="badge bg-red">${d.due} Due</span></td>
      <td class="sensitive-val">Rs ${d.billed.toLocaleString()}</td>
      <td class="sensitive-val"><strong>Rs ${d.dueRs.toLocaleString()}</strong></td>
      <td><button class="btn btn-primary btn-sm" onclick="bulkPrintClassChallans(${k})">Bulk Print Class ${k} Challans</button></td>
    </tr>`;
  }).join('');
}

// --- 2. FATHER CNIC / FAMILY TREE ---
function getFamiliesMap() {
  const map = {};
  students.forEach(s => {
    const key = (s.cnic || 'NO-CNIC').trim();
    if (!map[key]) {
      map[key] = {
        cnic: key,
        father: s.father,
        phone: s.phone,
        address: s.address || 'Islamabad',
        children: [],
        monthlyFee: 0,
        totalPaid: 0,
        totalDue: 0
      };
    }
    map[key].children.push(s);
    map[key].monthlyFee += (Number(s.fee) || 0);
    map[key].totalPaid += (Number(s.totalPaid) || 0);
    map[key].totalDue += (Number(s.balance) || 0);
  });
  return map;
}

function openFamilyByCNIC(cnic) {
  selectedCNIC = cnic;
  switchTab('family', document.getElementById('nav-family'));
  document.getElementById('cnicSearchInput').value = cnic;
  renderFamilySearch();
}

function renderFamilySearch() {
  const q = document.getElementById('cnicSearchInput').value.trim().toLowerCase();
  const famMap = getFamiliesMap();
  const allFams = Object.values(famMap);
  const matching = allFams.filter(f => !q || `${f.cnic} ${f.father} ${f.phone}`.toLowerCase().includes(q));
  const exact = famMap[document.getElementById('cnicSearchInput').value.trim()] ||
    (q && matching.length === 1 ? matching[0] : (selectedCNIC && famMap[selectedCNIC] ? famMap[selectedCNIC] : null));

  const box = document.getElementById('selectedFamilyBox');
  if (exact) {
    selectedCNIC = exact.cnic;
    box.style.display = 'block';
    document.getElementById('famHeaderTitle').textContent = `${exact.father} — CNIC: ${exact.cnic}`;
    document.getElementById('famHeaderSub').textContent = `Phone: ${exact.phone} | Address: ${exact.address}`;
    document.getElementById('famChildCount').textContent = `${exact.children.length} Sibling(s)`;
    document.getElementById('famMonthlyFee').textContent = `Rs ${exact.monthlyFee.toLocaleString()}`;
    document.getElementById('famTotalPaid').textContent = `Rs ${exact.totalPaid.toLocaleString()}`;
    document.getElementById('famTotalDue').textContent = `Rs ${exact.totalDue.toLocaleString()}`;

    document.getElementById('famChildrenBody').innerHTML = exact.children.map(c => {
      const st = getFeeStatus(c);
      const bCls = st === 'Paid' ? 'bg-green' : (st === 'Partial' ? 'bg-yellow' : 'bg-red');
      const arrears = Math.max(0, (Number(c.balance) || 0) - (Number(c.fee) || 0));
      return `<tr>
        <td><img class="stu-pic" src="${getPic(c)}"></td>
        <td><strong>${c.roll}</strong></td><td><strong>${c.name}</strong></td>
        <td>Class ${c.classNum}-${c.section}</td>
        <td class="sensitive-val">Rs ${(Number(c.fee) || 0).toLocaleString()}</td>
        <td class="sensitive-val">Rs ${arrears.toLocaleString()}</td>
        <td class="sensitive-val" style="color:#fb7185;font-weight:700;">Rs ${(Number(c.balance) || 0).toLocaleString()}</td>
        <td><span class="badge ${bCls}">${st}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="printTapsolStudentChallan('${c.id}')">Tapsol Challan</button>
          <button class="btn btn-success btn-sm" onclick="openPayModal('${c.id}')">Pay</button>
        </td>
      </tr>`;
    }).join('');
  } else {
    box.style.display = 'none';
  }

  document.getElementById('familyDirectoryBody').innerHTML = matching.slice(0, 80).map(f => `
    <tr>
      <td><span class="cnic-link" onclick="openFamilyByCNIC('${f.cnic}')">${f.cnic}</span></td>
      <td><strong>${f.father}</strong></td><td>${f.phone}</td>
      <td><span class="badge bg-blue">${f.children.length} Kids</span> ${f.children.map(c => `${c.name} (C-${c.classNum})`).join(', ')}</td>
      <td class="sensitive-val">Rs ${f.monthlyFee.toLocaleString()}</td>
      <td class="sensitive-val" style="color:${f.totalDue > 0 ? '#fb7185' : '#34d399'};font-weight:700;">Rs ${f.totalDue.toLocaleString()}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openFamilyByCNIC('${f.cnic}')">Open Family</button>
        <button class="btn btn-wa btn-sm" onclick="selectedCNIC='${f.cnic}';sendFamilyWhatsAppReminder()">WhatsApp</button>
      </td>
    </tr>
  `).join('');
}

function collectCombinedFamilyFee() {
  const fam = getFamiliesMap()[selectedCNIC];
  if (!fam || fam.totalDue <= 0) {
    alert('No pending dues for this family!');
    return;
  }
  const amtStr = prompt(`Receive Combined Family Fee from ${fam.father} (CNIC: ${fam.cnic}).\nTotal Combined Due: Rs ${fam.totalDue}:`, fam.totalDue);
  if (!amtStr) return;
  let rem = Number(amtStr) || 0;
  if (rem <= 0) return;

  const tx = db.transaction(['students', 'cashbook'], 'readwrite');
  const stuStore = tx.objectStore('students');
  const cbStore = tx.objectStore('cashbook');
  const totalPaidNow = rem;

  fam.children.forEach(c => {
    if (rem <= 0) return;
    const due = Number(c.balance) || 0;
    const payHere = Math.min(due, rem);
    if (payHere > 0) {
      c.balance = due - payHere;
      c.totalPaid = (Number(c.totalPaid) || 0) + payHere;
      rem -= payHere;
      stuStore.put(c);
    }
  });

  const voucherNo = 'VCH-' + (10001 + cashbook.length);
  cbStore.put({
    txId: voucherNo,
    timestamp: Date.now(),
    date: todayStr,
    type: 'IN',
    category: 'Family Fee',
    title: `Combined Family Fee (${fam.children.length} Kids) - ${fam.father}`,
    cnic: fam.cnic,
    stuId: '',
    roll: fam.children.map(x => x.roll).join(', '),
    mode: 'Cash Counter',
    amount: totalPaidNow
  });
  tx.oncomplete = () => {
    logAuditEvent(`Collected Combined Family Fee Rs ${totalPaidNow} for CNIC ${fam.cnic}`);
    loadAllData().then(() => printTapsolPOSReceipt(voucherNo));
  };
}

// --- TAPSOL 3-COPY CHALLAN ENGINE ---
function buildSingleChallanColumnHTML(copyTitle, billNo, stuOrFam) {
  const logo = schoolBrand.logo || makeDefaultLogoSVG(schoolBrand.name);
  const dueDate = '10-' + new Date().toISOString().slice(5, 7) + '-' + new Date().getFullYear();
  const lateFine = 300;
  const withinDue = stuOrFam.totalDue > 0 ? stuOrFam.totalDue : stuOrFam.tuition;
  const afterDue = withinDue + lateFine;

  return `
    <div class="challan-col">
      <div class="copy-tag">${copyTitle}</div>
      <div class="ch-hdr">
        <img src="${logo}" class="ch-logo">
        <div><div class="ch-sname">${schoolBrand.name}</div><div class="ch-sub">${schoolBrand.tagline}</div></div>
      </div>
      <div class="ch-bank">${schoolBrand.bank || 'HBL Islamic A/C # 0042-79001234-03'}</div>
      <div class="ch-meta"><span><strong>Challan #:</strong> ${billNo}</span><span><strong>Due Date:</strong> <b style="color:#b91c1c">${dueDate}</b></span></div>
      <div class="ch-stu">
        <div><strong>Student:</strong> ${stuOrFam.name}</div>
        <div><strong>Roll / Class:</strong> ${stuOrFam.rollClass}</div>
        <div><strong>Father:</strong> ${stuOrFam.father} (${stuOrFam.cnic})</div>
      </div>
      <table class="ch-tbl">
        <thead><tr><th>Particulars</th><th style="text-align:right">Rs</th></tr></thead>
        <tbody>
          <tr><td>Monthly Tuition Fee</td><td align="right">${stuOrFam.tuition.toLocaleString()}</td></tr>
          <tr><td>Arrears / Balance</td><td align="right">${stuOrFam.arrears.toLocaleString()}</td></tr>
          <tr class="tot-row"><td><strong>Within Due Date</strong></td><td align="right"><strong>Rs ${withinDue.toLocaleString()}</strong></td></tr>
          <tr class="late-row"><td>After Due Date (+${lateFine})</td><td align="right"><strong>Rs ${afterDue.toLocaleString()}</strong></td></tr>
        </tbody>
      </table>
      <div class="barcode">*${billNo}*</div>
      <div class="signs"><span>Bank Stamp</span><span>Cashier Sign</span></div>
    </div>
  `;
}

function openTapsolMultiSheetWindow(sheetsDataArray, titleText) {
  const w = window.open('', '_blank', 'width=1120,height=760');
  const pagesHTML = sheetsDataArray.map(item => `
    <div class="sheet-page"><div class="sheet">
      ${buildSingleChallanColumnHTML('BANK COPY', item.billNo, item.data)}
      ${buildSingleChallanColumnHTML('SCHOOL ACCOUNTS COPY', item.billNo, item.data)}
      ${buildSingleChallanColumnHTML('PARENT / STUDENT COPY', item.billNo, item.data)}
    </div></div>
  `).join('');
  w.document.write(`
    <html><head><title>${titleText}</title>
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 10px; background: #fff; color: #0f172a; }
      .sheet-page { page-break-after: always; margin-bottom: 20px; }
      .sheet-page:last-child { page-break-after: auto; }
      .sheet { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; width: 100%; }
      .challan-col { border: 1.5px solid #1e293b; border-right: 2px dashed #475569; padding: 10px; border-radius: 6px; font-size: 11.5px; }
      .copy-tag { background: #0f172a; color: #fff; text-align: center; font-weight: 800; padding: 3px; font-size: 10.5px; margin-bottom: 6px; border-radius: 3px; }
      .ch-hdr { display: flex; align-items: center; gap: 8px; border-bottom: 1.5px solid #0f172a; padding-bottom: 6px; margin-bottom: 6px; }
      .ch-logo { width: 36px; height: 36px; object-fit: cover; border-radius: 6px; }
      .ch-sname { font-weight: 800; font-size: 12px; }
      .ch-sub { font-size: 9.5px; color: #475569; }
      .ch-bank { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px; font-weight: 700; text-align: center; font-size: 10px; margin-bottom: 6px; }
      .ch-meta { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 10.5px; }
      .ch-stu { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px; border-radius: 4px; margin-bottom: 8px; line-height: 1.45; }
      .ch-tbl { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
      .ch-tbl th, .ch-tbl td { border: 1px solid #94a3b8; padding: 4px 6px; }
      .tot-row { background: #dcfce7; font-size: 12px; }
      .late-row { background: #fee2e2; }
      .barcode { font-family: monospace; font-size: 14px; font-weight: 900; letter-spacing: 3px; text-align: center; margin: 8px 0; padding: 4px; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
      .signs { display: flex; justify-content: space-between; margin-top: 22px; padding-top: 4px; font-size: 10px; border-top: 1px dashed #94a3b8; }
    </style></head><body onload="window.print()">${pagesHTML}</body></html>
  `);
  w.document.close();
}

function printTapsolStudentChallan(stuId) {
  const s = students.find(x => x.id === stuId);
  if (!s) return;
  const tuition = Number(s.fee) || 0;
  const totalDue = Number(s.balance) || 0;
  openTapsolMultiSheetWindow([{
    billNo: 'CH-' + s.roll.replace(/[^0-9]/g, ''),
    data: {
      name: s.name,
      rollClass: `${s.roll} (Class ${s.classNum}-${s.section})`,
      father: s.father,
      cnic: s.cnic,
      tuition,
      arrears: Math.max(0, totalDue - tuition),
      totalDue
    }
  }], `Challan - ${s.name}`);
}

function printTapsolFamilyChallan() {
  const fam = getFamiliesMap()[selectedCNIC];
  if (!fam) return;
  openTapsolMultiSheetWindow([{
    billNo: 'FAM-' + fam.cnic.slice(-5).replace('-', ''),
    data: {
      name: `${fam.children.length} Siblings`,
      rollClass: fam.children.map(c => `${c.roll}(C${c.classNum})`).join(', '),
      father: fam.father,
      cnic: fam.cnic,
      tuition: fam.monthlyFee,
      arrears: Math.max(0, fam.totalDue - fam.monthlyFee),
      totalDue: fam.totalDue
    }
  }], `Family Challan - ${fam.cnic}`);
}

function bulkPrintClassChallans(classNum) {
  const list = students.filter(s => s.classNum === Number(classNum));
  if (!list.length) {
    alert('No students enrolled in Class ' + classNum);
    return;
  }
  const batch = list.slice(0, 60).map(s => {
    const tuition = Number(s.fee) || 0;
    const totalDue = Number(s.balance) || 0;
    return {
      billNo: 'CH-' + s.roll.replace(/[^0-9]/g, ''),
      data: {
        name: s.name,
        rollClass: `${s.roll} (Class ${s.classNum}-${s.section})`,
        father: s.father,
        cnic: s.cnic,
        tuition,
        arrears: Math.max(0, totalDue - tuition),
        totalDue
      }
    };
  });
  openTapsolMultiSheetWindow(batch, `Bulk Class ${classNum} Challans`);
}

function bulkPrintFilteredChallans() {
  bulkPrintClassChallans(document.getElementById('feeClassFilter').value || '1');
}

// --- SLC CERTIFICATE ---
function openSLCModal(stuId) {
  const s = students.find(x => x.id === stuId);
  if (!s) return;
  document.getElementById('slcModal').classList.add('open');
  document.getElementById('slcStuId').value = s.id;
  document.getElementById('slcStuBanner').innerHTML = `
    <img class="stu-pic" src="${getPic(s)}">
    <div><strong>${s.name} (${s.roll})</strong><br><small>Father: ${s.father} | CNIC: ${s.cnic}</small></div>
  `;
}

function printSLCCertificate() {
  const s = students.find(x => x.id === document.getElementById('slcStuId').value);
  if (!s) return;
  const certTitle = document.getElementById('slcType').value;
  const admDate = document.getElementById('slcAdmDate').value;
  const leaveDate = document.getElementById('slcLeaveDate').value;
  const conduct = document.getElementById('slcConduct').value;
  const reason = document.getElementById('slcReason').value;
  const logo = schoolBrand.logo || makeDefaultLogoSVG(schoolBrand.name);
  closeModal('slcModal');

  const w = window.open('', '_blank', 'width=850,height=680');
  w.document.write(`
    <html><head><title>${certTitle}</title>
    <style>
      body { font-family: 'Georgia', serif; padding: 24px; background: #f8fafc; color: #0f172a; }
      .cert-outer { border: 6px double #1e3a8a; padding: 28px 36px; background: #fff; max-width: 760px; margin: auto; border-radius: 10px; }
      .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 18px; }
      .title-banner { text-align: center; background: #1e3a8a; color: #fff; font-weight: 800; padding: 8px; border-radius: 6px; font-size: 16px; margin-bottom: 20px; font-family: sans-serif; }
      .body-text { font-size: 15.5px; line-height: 2; text-align: justify; margin-bottom: 22px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-family: sans-serif; font-size: 13.5px; background: #f8fafc; padding: 14px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 32px; }
      .signs { display: flex; justify-content: space-between; margin-top: 45px; font-family: sans-serif; font-size: 13px; font-weight: 700; }
    </style></head>
    <body onload="window.print()">
      <div class="cert-outer">
        <div class="hdr">
          <img src="${logo}" style="width:70px;height:70px;border-radius:12px;object-fit:cover;">
          <div style="text-align:center;flex:1;">
            <h1 style="margin:0;font-size:21px;color:#1e3a8a;font-family:sans-serif;">${schoolBrand.name}</h1>
            <div style="font-size:12px;color:#475569;font-family:sans-serif;">${schoolBrand.tagline}</div>
          </div>
          <img src="${getPic(s)}" style="width:70px;height:70px;border-radius:10px;object-fit:cover;">
        </div>
        <div class="title-banner">${certTitle}</div>
        <div class="body-text">
          This is to certify that <strong>${s.name}</strong>, child of <strong>${s.father}</strong> (Father CNIC: <strong>${s.cnic}</strong>), has been an enrolled student under Roll No <strong>${s.roll}</strong> in <strong>Class ${s.classNum}-${s.section}</strong>. Moral character and conduct remained <strong>${conduct}</strong>.
        </div>
        <div class="grid">
          <div><strong>Roll No:</strong> ${s.roll}</div><div><strong>Class:</strong> Class ${s.classNum}-${s.section}</div>
          <div><strong>Admission Date:</strong> ${admDate}</div><div><strong>Leaving Date:</strong> ${leaveDate}</div>
          <div><strong>Account Clearance:</strong> ${s.balance <= 0 ? 'Cleared (Rs 0 Due)' : 'Pending Rs ' + s.balance}</div>
          <div><strong>Conduct:</strong> ${conduct}</div>
          <div style="grid-column:1/-1;"><strong>Remarks:</strong> ${reason}</div>
        </div>
        <div class="signs"><span>Registrar Signature</span><span>Accounts Stamp</span><span>Principal Signature & Seal</span></div>
      </div>
    </body></html>
  `);
  w.document.close();
}

// --- TAPSOL POS RECEIPT ---
function printTapsolPOSReceipt(txId) {
  const x = cashbook.find(item => item.txId === txId);
  if (!x) return;
  const logo = schoolBrand.logo || makeDefaultLogoSVG(schoolBrand.name);
  const w = window.open('', '_blank', 'width=420,height=600');
  w.document.write(`
    <html><head><title>Receipt - ${x.txId}</title>
    <style>
      body { font-family: 'Segoe UI', monospace; padding: 14px; background: #f8fafc; color: #0f172a; }
      .pos { width: 320px; margin: auto; background: #fff; padding: 16px; border: 1.5px solid #0f172a; border-radius: 8px; }
      .center { text-align: center; }
      .line { border-top: 1px dashed #64748b; margin: 8px 0; }
      .row { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; }
      .stamp { border: 2px solid #16a34a; color: #16a34a; font-weight: 900; padding: 4px 10px; display: inline-block; border-radius: 4px; margin-top: 8px; font-size: 12px; }
    </style></head>
    <body onload="window.print()">
      <div class="pos">
        <div class="center">
          <img src="${logo}" style="width:46px;height:46px;border-radius:8px;object-fit:cover;">
          <h3 style="margin:4px 0 2px;font-size:14px;">${schoolBrand.name}</h3>
          <div style="font-size:10px;color:#475569;">${schoolBrand.tagline}</div>
          <div style="background:#0f172a;color:#fff;font-size:11px;font-weight:700;padding:3px;margin-top:6px;">OFFICIAL ${x.type === 'IN' ? 'FEE RECEIPT' : 'PAYMENT VOUCHER'}</div>
        </div>
        <div class="line"></div>
        <div class="row"><span>Voucher #:</span><strong>${x.txId}</strong></div>
        <div class="row"><span>Date:</span><span>${x.date}</span></div>
        <div class="row"><span>Category:</span><strong>${x.category}</strong></div>
        <div class="row"><span>Mode / Bank:</span><span>${x.mode}</span></div>
        <div class="row"><span>CNIC / Ref:</span><span>${x.cnic}</span></div>
        <div class="line"></div>
        <div style="font-size:12px;margin-bottom:6px;"><strong>Particulars:</strong><br>${x.title}</div>
        <div class="line"></div>
        <div class="row" style="font-size:15px;font-weight:800;">
          <span>TOTAL ${x.type === 'IN' ? 'RECEIVED' : 'PAID'}:</span>
          <span>Rs ${Number(x.amount).toLocaleString()}</span>
        </div>
        <div class="line"></div>
        <div class="center">
          <div class="stamp">${x.type === 'IN' ? 'PAID & VERIFIED' : 'DISBURSED & POSTED'}</div>
          <div style="font-family:monospace;font-size:13px;letter-spacing:3px;margin-top:8px;">*${x.txId}*</div>
        </div>
      </div>
    </body></html>
  `);
  w.document.close();
}

// --- 3. STUDENTS & EXCEL CSV IMPORTER ---
function checkSiblingsByCNIC(cnicVal) {
  const clean = cnicVal.trim();
  const alertBox = document.getElementById('siblingAlertBox');
  if (clean.length < 5) {
    alertBox.style.display = 'none';
    return;
  }
  const matches = students.filter(s => s.cnic && s.cnic.toLowerCase() === clean.toLowerCase());
  if (matches.length > 0) {
    const first = matches[0];
    document.getElementById('fFather').value = first.father;
    document.getElementById('fPhone').value = first.phone;
    document.getElementById('fAddress').value = first.address || '';
    alertBox.style.display = 'block';
    alertBox.textContent = `Family Matched! ${matches.length} sibling(s) admitted: ${matches.map(m => m.name).join(', ')}.`;
  } else {
    alertBox.style.display = 'none';
  }
}

function openStudentModalWithCNIC() {
  openStudentModal('');
  if (selectedCNIC) {
    document.getElementById('fCnic').value = selectedCNIC;
    checkSiblingsByCNIC(selectedCNIC);
  }
}

function openStudentModal(id = '') {
  document.getElementById('stuModal').classList.add('open');
  document.getElementById('siblingAlertBox').style.display = 'none';
  if (id) {
    const s = students.find(x => x.id === id);
    if (!s) return;
    document.getElementById('fStuId').value = s.id;
    document.getElementById('fCnic').value = s.cnic || '';
    document.getElementById('fRoll').value = s.roll;
    document.getElementById('fName').value = s.name;
    document.getElementById('fFather').value = s.father;
    document.getElementById('fGender').value = s.gender;
    document.getElementById('fClass').value = s.classNum;
    document.getElementById('fSec').value = s.section;
    document.getElementById('fPhone').value = s.phone;
    document.getElementById('fAddress').value = s.address || '';
    document.getElementById('fFee').value = s.fee;
    document.getElementById('fBalance').value = s.balance;
    currentPhoto = s.photo || '';
    document.getElementById('fPicPreview').src = getPic(s);
  } else {
    document.getElementById('fStuId').value = '';
    document.getElementById('fCnic').value = '';
    document.getElementById('fRoll').value = `R-${1001 + students.length}`;
    document.getElementById('fName').value = '';
    document.getElementById('fFather').value = '';
    document.getElementById('fPhone').value = '0300-';
    document.getElementById('fAddress').value = '';
    document.getElementById('fFee').value = 4000;
    document.getElementById('fBalance').value = 4000;
    currentPhoto = '';
    updateAvatarPreview();
  }
}

function saveStudent() {
  const id = document.getElementById('fStuId').value || ('stu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  const roll = document.getElementById('fRoll').value.trim();
  const name = document.getElementById('fName').value.trim();
  const cnic = document.getElementById('fCnic').value.trim() || '61101-0000000-0';
  if (!roll || !name) {
    alert('Roll No and Student Name are required!');
    return;
  }

  const existing = students.find(x => x.id === id);
  const stu = {
    id,
    roll,
    name,
    cnic,
    father: document.getElementById('fFather').value.trim() || 'N/A',
    gender: document.getElementById('fGender').value,
    classNum: Number(document.getElementById('fClass').value),
    section: document.getElementById('fSec').value,
    phone: document.getElementById('fPhone').value.trim(),
    address: document.getElementById('fAddress').value.trim(),
    fee: Number(document.getElementById('fFee').value) || 0,
    balance: Number(document.getElementById('fBalance').value) || 0,
    totalPaid: existing ? (Number(existing.totalPaid) || 0) : 0,
    photo: currentPhoto,
    exams: existing && existing.exams ? existing.exams : { math: 80, sci: 78, eng: 82, urdu: 84 }
  };

  const tx = db.transaction('students', 'readwrite');
  tx.objectStore('students').put(stu);
  tx.oncomplete = () => {
    logAuditEvent(`Saved Student Record: ${name} (${roll})`);
    closeModal('stuModal');
    loadAllData();
  };
}

function importStudentsCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return;
    const tx = db.transaction('students', 'readwrite');
    const store = tx.objectStore('students');
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
      if (cols.length >= 3) {
        store.put({
          id: `stu_csv_${Date.now()}_${i}`,
          roll: cols[0] || `R-${1000 + i}`,
          name: cols[1] || 'Student',
          father: cols[2] || 'Guardian',
          cnic: cols[3] || '61101-0000000-0',
          gender: cols[4] || 'Male',
          classNum: Number(cols[5]) || 1,
          section: cols[6] || 'A',
          phone: cols[7] || '0300-0000000',
          fee: Number(cols[8]) || 4000,
          totalPaid: Number(cols[9]) || 0,
          balance: Number(cols[10]) || 0,
          photo: '',
          exams: { math: 80, sci: 80, eng: 80, urdu: 80 }
        });
        count++;
      }
    }
    tx.oncomplete = () => {
      logAuditEvent(`Bulk Imported ${count} Students from CSV`);
      loadAllData();
      alert(`Imported ${count} students from CSV!`);
    };
  };
  r.readAsText(file);
}

function renderStudents() {
  const q = document.getElementById('stuSearch').value.trim().toLowerCase();
  const c = document.getElementById('stuClassFilter').value;
  const sec = document.getElementById('stuSecFilter').value;
  const list = students.filter(s => {
    if (c && String(s.classNum) !== c) return false;
    if (sec && s.section !== sec) return false;
    if (q && !(`${s.roll} ${s.name} ${s.father} ${s.cnic} ${s.phone}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const maxPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (stuPage > maxPage) stuPage = maxPage;
  const start = (stuPage - 1) * PAGE_SIZE;
  const slice = list.slice(start, start + PAGE_SIZE);
  const canDel = currentUserRole === 'Principal';

  document.getElementById('stuPageInfo').textContent = `Showing ${list.length ? start + 1 : 0}-${Math.min(start + PAGE_SIZE, list.length)} of ${list.length.toLocaleString()} students`;
  document.getElementById('stuTableBody').innerHTML = slice.map(s => `
    <tr>
      <td><img class="stu-pic" src="${getPic(s)}"></td>
      <td><strong>${s.roll}</strong></td><td><strong>${s.name}</strong></td><td>${s.father}</td>
      <td><span class="cnic-link" onclick="openFamilyByCNIC('${s.cnic}')">${s.cnic}</span></td>
      <td>Class ${s.classNum}-${s.section}</td><td>${s.phone}</td>
      <td class="sensitive-val">Rs ${(Number(s.fee) || 0).toLocaleString()}</td>
      <td class="sensitive-val" style="color:${s.balance > 0 ? '#fb7185' : '#34d399'};font-weight:700;">Rs ${(Number(s.balance) || 0).toLocaleString()}</td>
      <td>
        <button class="btn btn-purple btn-sm" onclick="openSLCModal('${s.id}')">SLC</button>
        <button class="btn btn-wa btn-sm" onclick="sendStudentWhatsAppFee('${s.id}')">WA</button>
        <button class="btn btn-outline btn-sm" onclick="printIDCard('${s.id}')">ID</button>
        <button class="btn btn-outline btn-sm" onclick="openStudentModal('${s.id}')">Edit</button>
        ${canDel ? `<button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}')">X</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function deleteStudent(id) {
  if (currentUserRole !== 'Principal') return;
  if (!confirm('Delete this student permanently?')) return;
  const tx = db.transaction('students', 'readwrite');
  tx.objectStore('students').delete(id);
  tx.oncomplete = () => {
    logAuditEvent(`Deleted Student ID ${id}`);
    loadAllData();
  };
}

function printIDCard(id) {
  const s = students.find(x => x.id === id);
  if (!s) return;
  const w = window.open('', '_blank', 'width=420,height=520');
  w.document.write(`<html><body onload="window.print()" style="font-family:sans-serif;display:flex;justify-content:center;padding:25px;">
    <div style="width:300px;border:2px solid #0f172a;border-radius:12px;overflow:hidden;text-align:center;">
      <div style="background:#0f172a;color:#00f2fe;padding:12px;font-weight:800;">${schoolBrand.name}<br><small style="color:#fff;">STUDENT IDENTITY CARD</small></div>
      <img src="${getPic(s)}" style="width:88px;height:88px;border-radius:50%;margin-top:14px;border:3px solid #0284c7;object-fit:cover;">
      <h3 style="margin:8px 0 2px;">${s.name}</h3>
      <div style="color:#0284c7;font-weight:700;font-size:0.85rem;margin-bottom:10px;">Roll No: ${s.roll} | Class ${s.classNum}-${s.section}</div>
      <div style="text-align:left;padding:12px 18px;border-top:1px solid #cbd5e1;font-size:0.84rem;line-height:1.6;">
        <strong>Father:</strong> ${s.father}<br><strong>Father CNIC:</strong> ${s.cnic}<br><strong>Phone:</strong> ${s.phone}<br><strong>Address:</strong> ${s.address || 'Islamabad'}
      </div>
    </div></body></html>`);
  w.document.close();
}

// --- 4. FEES & TAPSOL CHALLANS ---
function renderFees() {
  const q = document.getElementById('feeSearch').value.trim().toLowerCase();
  const cls = document.getElementById('feeClassFilter').value;
  const st = document.getElementById('feeStatusFilter').value;
  const list = students.filter(s => {
    if (cls && String(s.classNum) !== cls) return false;
    if (st && getFeeStatus(s) !== st) return false;
    if (q && !(`${s.roll} ${s.name} ${s.cnic} ${s.father}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const maxPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (feePage > maxPage) feePage = maxPage;
  const start = (feePage - 1) * PAGE_SIZE;
  const slice = list.slice(start, start + PAGE_SIZE);

  document.getElementById('feePageInfo').textContent = `Showing ${list.length ? start + 1 : 0}-${Math.min(start + PAGE_SIZE, list.length)} of ${list.length.toLocaleString()}`;
  document.getElementById('feeTableBody').innerHTML = slice.map(s => {
    const status = getFeeStatus(s);
    const bCls = status === 'Paid' ? 'bg-green' : (status === 'Partial' ? 'bg-yellow' : 'bg-red');
    return `<tr>
      <td><img class="stu-pic" src="${getPic(s)}"></td>
      <td><strong>${s.roll}</strong></td><td>${s.name}</td>
      <td><span class="cnic-link" onclick="openFamilyByCNIC('${s.cnic}')">${s.cnic}</span></td>
      <td>Class ${s.classNum}-${s.section}</td>
      <td class="sensitive-val">Rs ${(Number(s.fee) || 0).toLocaleString()}</td>
      <td class="sensitive-val" style="color:#fb7185;font-weight:700;">Rs ${(Number(s.balance) || 0).toLocaleString()}</td>
      <td><span class="badge ${bCls}">${status}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="printTapsolStudentChallan('${s.id}')">3-Copy Challan</button>
        <button class="btn btn-success btn-sm" onclick="openPayModal('${s.id}')">Receive Fee</button>
        <button class="btn btn-wa btn-sm" onclick="sendStudentWhatsAppFee('${s.id}')">WhatsApp</button>
      </td>
    </tr>`;
  }).join('');
}

function openPayModal(id) {
  const s = students.find(x => x.id === id);
  if (!s) return;
  document.getElementById('payModal').classList.add('open');
  document.getElementById('pStuId').value = s.id;
  document.getElementById('pDue').value = s.balance || 0;
  document.getElementById('pAmount').value = s.balance > 0 ? s.balance : s.fee;
  document.getElementById('pStuBanner').innerHTML = `
    <img class="stu-pic" src="${getPic(s)}">
    <div><strong>${s.name} (${s.roll})</strong><br><small>Father: ${s.father} | CNIC: ${s.cnic}</small></div>
  `;
}

function confirmStudentFee() {
  const s = students.find(x => x.id === document.getElementById('pStuId').value);
  if (!s) return;
  const amt = Number(document.getElementById('pAmount').value) || 0;
  if (amt <= 0) return;

  s.balance = Math.max(0, (Number(s.balance) || 0) - amt);
  s.totalPaid = (Number(s.totalPaid) || 0) + amt;

  const voucherNo = 'RCP-' + (10001 + cashbook.length);
  const tx = db.transaction(['students', 'cashbook'], 'readwrite');
  tx.objectStore('students').put(s);
  tx.objectStore('cashbook').put({
    txId: voucherNo,
    timestamp: Date.now(),
    date: todayStr,
    type: 'IN',
    category: 'Tuition Fee',
    title: `Fee Paid: ${s.name} (${s.roll}) - ${document.getElementById('pMonth').value}`,
    cnic: s.cnic,
    stuId: s.id,
    roll: s.roll,
    mode: document.getElementById('pMode').value,
    amount: amt
  });
  tx.oncomplete = () => {
    logAuditEvent(`Fee Received Rs ${amt} from ${s.name} (${s.roll})`);
    closeModal('payModal');
    loadAllData().then(() => printTapsolPOSReceipt(voucherNo));
  };
}

function billNewMonthAllStudents() {
  if (!confirm('Add 1 month tuition fee to all enrolled students?')) return;
  const tx = db.transaction('students', 'readwrite');
  students.forEach(s => {
    s.balance = (Number(s.balance) || 0) + (Number(s.fee) || 0);
    tx.objectStore('students').put(s);
  });
  tx.oncomplete = () => {
    logAuditEvent('Billed New Month Fee to All Students');
    loadAllData();
  };
}

// --- 5. CASHBOOK ---
function populateCashCategories() {
  const t = document.getElementById('cType').value;
  const outCats = ['Staff Salary', 'Electricity Bill', 'Sui Gas Bill', 'WiFi / Internet Bill', 'Building Rent', 'Stationery & Printing', 'Generator Fuel', 'Repair & Maintenance', 'Other'];
  const inCats = ['Admission / Annual Fund', 'Tuition Fee', 'Book / Uniform Sale', 'Other'];
  document.getElementById('cCategory').innerHTML = (t === 'OUT' ? outCats : inCats).map(c => `<option value="${c}">${c}</option>`).join('');
}

function openCashModal(type = 'OUT') {
  document.getElementById('cashModal').classList.add('open');
  document.getElementById('cType').value = type;
  populateCashCategories();
  document.getElementById('cTitle').value = '';
  document.getElementById('cAmount').value = '';
  document.getElementById('cRef').value = '';
}

function saveCashTransaction() {
  const title = document.getElementById('cTitle').value.trim();
  const amount = Number(document.getElementById('cAmount').value) || 0;
  if (!title || amount <= 0) return;
  const voucherNo = 'VCH-' + (10001 + cashbook.length);
  const type = document.getElementById('cType').value;
  const tx = db.transaction('cashbook', 'readwrite');
  tx.objectStore('cashbook').put({
    txId: voucherNo,
    timestamp: Date.now(),
    date: document.getElementById('cDate').value || todayStr,
    type,
    category: document.getElementById('cCategory').value,
    title,
    cnic: document.getElementById('cRef').value.trim() || '-',
    stuId: '',
    roll: '-',
    mode: document.getElementById('cMode').value,
    amount
  });
  tx.oncomplete = () => {
    logAuditEvent(`Posted Cash ${type}: Rs ${amount} (${title})`);
    closeModal('cashModal');
    loadAllData();
  };
}

function renderCashbook() {
  const q = document.getElementById('cbSearch').value.trim().toLowerCase();
  const t = document.getElementById('cbTypeFilter').value;
  const filtered = cashbook.filter(x => {
    if (t && x.type !== t) return false;
    if (q && !(`${x.txId} ${x.title} ${x.category} ${x.cnic}`.toLowerCase().includes(q))) return false;
    return true;
  });
  let sumIn = 0;
  let sumOut = 0;
  filtered.forEach(x => {
    if (x.type === 'IN') sumIn += Number(x.amount) || 0;
    else sumOut += Number(x.amount) || 0;
  });
  document.getElementById('cbIn').textContent = `Rs ${sumIn.toLocaleString()}`;
  document.getElementById('cbOut').textContent = `Rs ${sumOut.toLocaleString()}`;
  document.getElementById('cbNet').textContent = `Rs ${(sumIn - sumOut).toLocaleString()}`;

  document.getElementById('cashbookBody').innerHTML = filtered.slice(0, 150).map(x => `
    <tr>
      <td><strong>${x.txId}</strong></td><td>${x.date}</td>
      <td><span class="badge ${x.type === 'IN' ? 'bg-green' : 'bg-red'}">${x.type === 'IN' ? 'CASH IN' : 'CASH OUT'}</span></td>
      <td><strong>${x.category}</strong></td><td>${x.title}</td><td>${x.cnic}</td><td>${x.mode}</td>
      <td class="sensitive-val" style="color:#34d399;font-weight:700;">${x.type === 'IN' ? 'Rs ' + Number(x.amount).toLocaleString() : '-'}</td>
      <td class="sensitive-val" style="color:#fb7185;font-weight:700;">${x.type === 'OUT' ? 'Rs ' + Number(x.amount).toLocaleString() : '-'}</td>
      <td><button class="btn btn-outline btn-sm" onclick="printTapsolPOSReceipt('${x.txId}')">POS Slip</button></td>
    </tr>
  `).join('');
}

// --- 6. STAFF PAYROLL, BANK IBAN & TEACHER LOGIN ACCOUNTS ---
function openStaffModal(id = '') {
  document.getElementById('staffModal').classList.add('open');
  if (id) {
    const st = staffList.find(x => x.id === id);
    if (!st) return;
    document.getElementById('sId').value = st.id;
    document.getElementById('sEmpNo').value = st.empNo;
    document.getElementById('sName').value = st.name;
    document.getElementById('sRole').value = st.role;
    document.getElementById('sCnic').value = st.cnic;
    document.getElementById('sUser').value = st.username || st.empNo;
    document.getElementById('sPass').value = st.password || '';
    document.getElementById('sBankName').value = st.bankName || '';
    document.getElementById('sBankAcc').value = st.bankAcc || '';
    document.getElementById('sBasic').value = st.basic;
    document.getElementById('sAllow').value = st.allow;
    document.getElementById('sDeduct').value = st.deduct;
    document.getElementById('sPhone').value = st.phone;
  } else {
    document.getElementById('sId').value = '';
    document.getElementById('sEmpNo').value = `EMP-${101 + staffList.length}`;
    document.getElementById('sName').value = '';
    document.getElementById('sRole').value = 'Senior Teacher';
    document.getElementById('sCnic').value = '61101-';
    document.getElementById('sUser').value = `teacher_${101 + staffList.length}`;
    document.getElementById('sPass').value = '';
    document.getElementById('sBankName').value = 'Meezan Bank';
    document.getElementById('sBankAcc').value = 'PK36MEZN000';
    document.getElementById('sBasic').value = 35000;
    document.getElementById('sAllow').value = 2000;
    document.getElementById('sDeduct').value = 0;
    document.getElementById('sPhone').value = '0300-';
  }
}

function saveStaffMember() {
  const id = document.getElementById('sId').value || ('stf_' + Date.now());
  const name = document.getElementById('sName').value.trim();
  const username = document.getElementById('sUser').value.trim();
  const password = document.getElementById('sPass').value.trim();
  if (!name || !username || !password) {
    alert('Teacher Name, Login Username, and Password are required!');
    return;
  }

  const existing = staffList.find(x => x.id === id);
  const stObj = {
    id,
    empNo: document.getElementById('sEmpNo').value.trim() || 'EMP-101',
    name,
    role: document.getElementById('sRole').value.trim(),
    cnic: document.getElementById('sCnic').value.trim(),
    username,
    password,
    bankName: document.getElementById('sBankName').value.trim() || 'Bank Transfer',
    bankAcc: document.getElementById('sBankAcc').value.trim() || 'N/A',
    basic: Number(document.getElementById('sBasic').value) || 0,
    allow: Number(document.getElementById('sAllow').value) || 0,
    deduct: Number(document.getElementById('sDeduct').value) || 0,
    phone: document.getElementById('sPhone').value.trim(),
    status: existing ? existing.status : 'Pending',
    lastPaidDate: existing ? (existing.lastPaidDate || '-') : '-'
  };
  const tx = db.transaction('staff', 'readwrite');
  tx.objectStore('staff').put(stObj);
  tx.oncomplete = () => {
    logAuditEvent(`Saved Staff/Teacher Profile: ${name} (${username})`);
    closeModal('staffModal');
    loadAllData();
  };
}

function renderStaffPayroll() {
  let budget = 0;
  let paidCount = 0;
  document.getElementById('staffTableBody').innerHTML = staffList.map(st => {
    const net = (Number(st.basic) || 0) + (Number(st.allow) || 0) - (Number(st.deduct) || 0);
    budget += net;
    if (st.status === 'Paid') paidCount++;
    return `<tr>
      <td><strong>${st.empNo}</strong></td>
      <td><strong>${st.name}</strong><br><small style="color:var(--muted)">${st.role}</small></td>
      <td><code>${st.username || st.empNo}</code></td>
      <td><strong>${st.bankName || 'Cash'}</strong><br><small style="color:var(--neon-cyan)">${st.bankAcc || '-'}</small></td>
      <td class="sensitive-val">Rs ${Number(st.basic).toLocaleString()}</td>
      <td class="sensitive-val">Rs ${Number(st.allow).toLocaleString()}</td>
      <td class="sensitive-val">Rs ${Number(st.deduct).toLocaleString()}</td>
      <td class="sensitive-val" style="color:var(--neon-cyan);font-weight:800;">Rs ${net.toLocaleString()}</td>
      <td><span class="badge ${st.status === 'Paid' ? 'bg-green' : 'bg-red'}">${st.status}</span></td>
      <td>
        <button class="btn btn-success btn-sm" onclick="payStaffSalary('${st.id}')">Pay to Bank & Slip</button>
        <button class="btn btn-outline btn-sm" onclick="openStaffModal('${st.id}')">Edit</button>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('stTotalCount').textContent = staffList.length;
  document.getElementById('stMonthlyBudget').textContent = `Rs ${budget.toLocaleString()}`;
  document.getElementById('stPaidCount').textContent = `${paidCount} / ${staffList.length} Paid`;

  const sel = document.getElementById('teacherPortalSelect');
  if (sel) {
    sel.innerHTML = staffList.map(st => `<option value="${st.id}">${st.name} (${st.empNo} - ${st.username})</option>`).join('');
  }
}

function payStaffSalary(id) {
  const st = staffList.find(x => x.id === id);
  if (!st) return;
  const net = (Number(st.basic) || 0) + (Number(st.allow) || 0) - (Number(st.deduct) || 0);
  if (!confirm(`Transfer Rs ${net.toLocaleString()} salary to ${st.name} (${st.bankName}: ${st.bankAcc}) and record in Cash Out?`)) return;

  st.status = 'Paid';
  st.lastPaidDate = todayStr;
  const voucherNo = 'SAL-' + (5001 + cashbook.length);
  const tx = db.transaction(['staff', 'cashbook'], 'readwrite');
  tx.objectStore('staff').put(st);
  tx.objectStore('cashbook').put({
    txId: voucherNo,
    timestamp: Date.now(),
    date: todayStr,
    type: 'OUT',
    category: 'Staff Salary',
    title: `Salary Paid: ${st.name} (${st.empNo}) -> ${st.bankName} (${st.bankAcc})`,
    cnic: st.cnic,
    stuId: '',
    roll: st.empNo,
    mode: `${st.bankName} Transfer`,
    amount: net
  });
  tx.oncomplete = () => {
    logAuditEvent(`Disbursed Salary Rs ${net} to ${st.name} (${st.bankName})`);
    loadAllData().then(() => printTapsolPOSReceipt(voucherNo));
  };
}

function resetStaffPayrollMonth() {
  if (!confirm('Set all staff salary statuses to Pending for the new month?')) return;
  const tx = db.transaction('staff', 'readwrite');
  staffList.forEach(st => {
    st.status = 'Pending';
    tx.objectStore('staff').put(st);
  });
  tx.oncomplete = () => loadAllData();
}

// --- 7. TEACHER-ONLY PRIVATE SALARY PORTAL ---
function renderTeacherSelfPortal() {
  const targetId = currentUserRole === 'Teacher' ? loggedInTeacherId : (document.getElementById('teacherPortalSelect')?.value || staffList[0]?.id);
  const st = staffList.find(x => x.id === targetId);
  const container = document.getElementById('teacherPortalContent');
  if (!st) {
    container.innerHTML = `<p style="color:var(--muted);padding:14px;">No teacher profile available yet. Add teachers in Menu #6 (Staff Payroll & Bank IBAN).</p>`;
    return;
  }
  const net = (Number(st.basic) || 0) + (Number(st.allow) || 0) - (Number(st.deduct) || 0);
  container.innerHTML = `
    <div style="background:rgba(0,242,254,0.06);border:1px solid var(--neon-cyan);border-radius:14px;padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
        <div>
          <span class="badge bg-blue">EMPLOYEE ID: ${st.empNo}</span>
          <h3 style="font-size:1.3rem;color:#fff;margin-top:6px;">${st.name} — ${st.role}</h3>
          <div style="font-size:0.82rem;color:#cbd5e1;">CNIC: ${st.cnic} | Login Username: <code>${st.username}</code></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge ${st.status === 'Paid' ? 'bg-green' : 'bg-yellow'}" style="font-size:0.85rem;padding:6px 14px;">
            Status: ${st.status} ${st.lastPaidDate && st.lastPaidDate !== '-' ? '(' + st.lastPaidDate + ')' : ''}
          </span>
          <button class="btn btn-outline btn-sm" onclick="window.print()">Print My Salary Slip</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="label">Basic Salary</div><div class="val">Rs ${Number(st.basic).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">Allowances / Bonus</div><div class="val" style="color:#34d399;">+ Rs ${Number(st.allow).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">Deductions / Advance</div><div class="val" style="color:#fb7185;">- Rs ${Number(st.deduct).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">Net Take-Home Salary</div><div class="val" style="color:var(--neon-cyan);">Rs ${net.toLocaleString()}</div></div>
      </div>

      <div style="background:rgba(15,23,42,0.85);padding:14px;border-radius:10px;border:1px solid var(--glass-border);margin-top:10px;">
        <h4 style="margin-bottom:10px;color:var(--neon-cyan);font-size:0.88rem;">MY DESIGNATED BANK ACCOUNT / IBAN FOR SALARY TRANSFER</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;">
          <div class="form-group">
            <label>Bank Name (HBL / Meezan / UBL / EasyPaisa)</label>
            <input type="text" id="tSelfBankName" value="${st.bankName || ''}">
          </div>
          <div class="form-group">
            <label>Account Number / IBAN</label>
            <input type="text" id="tSelfBankAcc" value="${st.bankAcc || ''}">
          </div>
          <button class="btn btn-primary" onclick="updateTeacherOwnBank('${st.id}')">Update My Bank Details</button>
        </div>
      </div>
    </div>
  `;
}

function updateTeacherOwnBank(stId) {
  const st = staffList.find(x => x.id === stId);
  if (!st) return;
  st.bankName = document.getElementById('tSelfBankName').value.trim();
  st.bankAcc = document.getElementById('tSelfBankAcc').value.trim();
  const tx = db.transaction('staff', 'readwrite');
  tx.objectStore('staff').put(st);
  tx.oncomplete = () => {
    logAuditEvent(`Teacher ${st.name} updated Bank IBAN to ${st.bankName}`);
    loadAllData();
    alert('Your Bank Account & IBAN details have been updated!');
  };
}

// --- 8. UTILITY BILLS TRACKER ---
function openUtilityModal() {
  document.getElementById('utilModal').classList.add('open');
  document.getElementById('uProvider').value = '';
  document.getElementById('uRef').value = '';
  document.getElementById('uAmount').value = '';
}

function saveUtilityBill() {
  const type = document.getElementById('uType').value;
  const provider = document.getElementById('uProvider').value.trim() || type;
  const ref = document.getElementById('uRef').value.trim() || 'N/A';
  const month = document.getElementById('uMonth').value.trim() || 'Oct 2026';
  const dueDate = document.getElementById('uDueDate').value || todayStr;
  const amount = Number(document.getElementById('uAmount').value) || 0;
  if (amount <= 0) {
    alert('Enter valid bill amount!');
    return;
  }

  const tx = db.transaction('utilities', 'readwrite');
  tx.objectStore('utilities').put({
    id: 'util_' + Date.now(),
    type,
    provider,
    ref,
    month,
    dueDate,
    amount,
    status: 'Unpaid'
  });
  tx.oncomplete = () => {
    logAuditEvent(`Added ${type} (${provider}) Rs ${amount}`);
    closeModal('utilModal');
    loadAllData();
  };
}

function renderUtilities() {
  let elec = 0;
  let gas = 0;
  let wifi = 0;
  let unpaid = 0;
  document.getElementById('utilityTableBody').innerHTML = utilities.map(u => {
    const amt = Number(u.amount) || 0;
    if (u.type.includes('Electricity')) elec += amt;
    else if (u.type.includes('Gas')) gas += amt;
    else if (u.type.includes('WiFi')) wifi += amt;
    if (u.status !== 'Paid') unpaid += amt;

    return `<tr>
      <td><strong>${u.type}</strong></td>
      <td>${u.provider}</td>
      <td><code>${u.ref}</code></td>
      <td>${u.month}</td>
      <td>${u.dueDate}</td>
      <td class="sensitive-val" style="font-weight:700;">Rs ${amt.toLocaleString()}</td>
      <td><span class="badge ${u.status === 'Paid' ? 'bg-green' : 'bg-red'}">${u.status}</span></td>
      <td>
        ${u.status !== 'Paid'
          ? `<button class="btn btn-success btn-sm" onclick="payUtilityBill('${u.id}')">Pay Bill & Post Cash Out</button>`
          : `<span style="color:#34d399;font-size:0.75rem;font-weight:700;">Paid & Posted</span>`}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('uElecTotal').textContent = `Rs ${elec.toLocaleString()}`;
  document.getElementById('uGasTotal').textContent = `Rs ${gas.toLocaleString()}`;
  document.getElementById('uWifiTotal').textContent = `Rs ${wifi.toLocaleString()}`;
  document.getElementById('uUnpaidTotal').textContent = `Rs ${unpaid.toLocaleString()}`;
}

function payUtilityBill(id) {
  const u = utilities.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`Mark ${u.type} (Ref: ${u.ref}) of Rs ${Number(u.amount).toLocaleString()} as PAID and deduct from Cash Out?`)) return;
  u.status = 'Paid';
  const voucherNo = 'UTL-' + (8001 + cashbook.length);
  const tx = db.transaction(['utilities', 'cashbook'], 'readwrite');
  tx.objectStore('utilities').put(u);
  tx.objectStore('cashbook').put({
    txId: voucherNo,
    timestamp: Date.now(),
    date: todayStr,
    type: 'OUT',
    category: u.type,
    title: `${u.type} Paid: ${u.provider} (${u.month})`,
    cnic: u.ref,
    stuId: '',
    roll: '-',
    mode: 'Bank / Online',
    amount: Number(u.amount)
  });
  tx.oncomplete = () => {
    logAuditEvent(`Paid Utility Bill: ${u.type} Rs ${u.amount}`);
    loadAllData().then(() => printTapsolPOSReceipt(voucherNo));
  };
}

// --- 9. ATTENDANCE & 10. EXAMS ---
function renderAttendance() {
  const date = document.getElementById('attDate').value;
  const c = Number(document.getElementById('attClass').value);
  const sec = document.getElementById('attSec').value;
  const roster = students.filter(s => s.classNum === c && s.section === sec);
  let p = 0;
  let a = 0;
  document.getElementById('attTableBody').innerHTML = roster.map(s => {
    const rec = attendanceMap[`${date}_${s.id}`] || { status: 'Present', remarks: '' };
    if (rec.status === 'Present') p++; else a++;
    return `<tr data-id="${s.id}">
      <td><img class="stu-pic" src="${getPic(s)}"></td><td><strong>${s.roll}</strong></td><td>${s.name}</td><td>${s.father}</td>
      <td><button class="badge ${rec.status === 'Present' ? 'bg-green' : 'bg-red'}" style="border:none;cursor:pointer;padding:6px 12px;" onclick="this.textContent = this.textContent === 'Present' ? 'Absent' : 'Present'; this.className = 'badge ' + (this.textContent === 'Present' ? 'bg-green' : 'bg-red')">${rec.status}</button></td>
      <td><input type="text" class="att-rem" value="${rec.remarks || ''}" style="width:100%;"></td>
      <td><button class="btn btn-wa btn-sm" onclick="sendAbsentWhatsApp('${s.id}', '${date}')">WhatsApp Alert</button></td>
    </tr>`;
  }).join('');
  document.getElementById('attBadge').textContent = `Roster: ${roster.length} | Present: ${p} | Absent: ${a}`;
}

function markAllAtt(st) {
  document.querySelectorAll('#attTableBody tr button.badge').forEach(b => {
    b.textContent = st;
    b.className = 'badge bg-green';
  });
}

function saveAttendance() {
  const date = document.getElementById('attDate').value;
  const tx = db.transaction('attendance', 'readwrite');
  document.querySelectorAll('#attTableBody tr').forEach(r => {
    const stuId = r.getAttribute('data-id');
    const item = {
      key: `${date}_${stuId}`,
      date,
      stuId,
      status: r.querySelector('button.badge').textContent,
      remarks: r.querySelector('.att-rem').value
    };
    tx.objectStore('attendance').put(item);
    attendanceMap[item.key] = item;
  });
  tx.oncomplete = () => alert('Attendance Saved!');
}

function renderExams() {
  const c = Number(document.getElementById('examClass').value);
  const sec = document.getElementById('examSec').value;
  const roster = students.filter(s => s.classNum === c && s.section === sec);
  document.getElementById('examTableBody').innerHTML = roster.map(s => {
    const ex = s.exams || { math: 80, sci: 75, eng: 82, urdu: 80 };
    const tot = (Number(ex.math) || 0) + (Number(ex.sci) || 0) + (Number(ex.eng) || 0) + (Number(ex.urdu) || 0);
    const pct = ((tot / 400) * 100).toFixed(1);
    return `<tr data-id="${s.id}">
      <td><img class="stu-pic" src="${getPic(s)}"></td><td><strong>${s.roll}</strong></td><td>${s.name}</td>
      <td><input type="number" class="m-math" value="${ex.math}" style="width:60px;"></td>
      <td><input type="number" class="m-sci" value="${ex.sci}" style="width:60px;"></td>
      <td><input type="number" class="m-eng" value="${ex.eng}" style="width:60px;"></td>
      <td><input type="number" class="m-urdu" value="${ex.urdu}" style="width:60px;"></td>
      <td><strong>${tot}/400</strong></td><td><span class="badge bg-blue">${pct}%</span></td>
      <td><button class="btn btn-outline btn-sm" onclick="window.print()">Print</button></td>
    </tr>`;
  }).join('');
}

function saveExamMarks() {
  const tx = db.transaction('students', 'readwrite');
  document.querySelectorAll('#examTableBody tr').forEach(r => {
    const s = students.find(x => x.id === r.getAttribute('data-id'));
    if (s) {
      s.exams = {
        math: Number(r.querySelector('.m-math').value) || 0,
        sci: Number(r.querySelector('.m-sci').value) || 0,
        eng: Number(r.querySelector('.m-eng').value) || 0,
        urdu: Number(r.querySelector('.m-urdu').value) || 0
      };
      tx.objectStore('students').put(s);
    }
  });
  tx.oncomplete = () => {
    renderExams();
    alert('Exam Marks Saved!');
  };
}

// --- 11. EXPORT, BACKUP, .BAT LAUNCHER & MULTI-LOCK WIPE SECURITY ---
function downloadBatLauncher() {
  const batContent = [
    '@echo off',
    'title EduCore Aurora Flagship ERP Launcher',
    'if exist "index.html" (',
    '  start "" "index.html"',
    '  exit',
    ')',
    'for %%f in (*.html) do (',
    '  start "" "%%f"',
    '  exit',
    ')',
    'pause'
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([batContent], { type: 'application/x-bat' }));
  a.download = 'Launch_School_ERP.bat';
  a.click();
}

function exportStudentsCSV() {
  const hdr = ['Roll No','Student Name','Father Name','Father CNIC','Gender','Class','Section','Phone','Monthly Fee','Total Paid','Balance Due'];
  const rows = students.map(s => [s.roll, `"${s.name}"`, `"${s.father}"`, s.cnic, s.gender, s.classNum, s.section, s.phone, s.fee, s.totalPaid || 0, s.balance || 0].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[hdr.join(','), ...rows].join('\n')], { type: 'text/csv' }));
  a.download = 'students_register.csv';
  a.click();
}

function exportCashbookCSV() {
  const hdr = ['Voucher No','Date','Type','Category','Description','CNIC / Ref','Mode','Amount'];
  const rows = cashbook.map(x => [x.txId, x.date, x.type, `"${x.category}"`, `"${x.title}"`, x.cnic, x.mode, x.amount].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[hdr.join(','), ...rows].join('\n')], { type: 'text/csv' }));
  a.download = 'cashbook_in_out.csv';
  a.click();
}

function downloadBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({
    schoolBrand,
    students,
    cashbook,
    staffList,
    utilities,
    auditLogs,
    attendance: Object.values(attendanceMap)
  }, null, 2)], { type: 'application/json' }));
  a.download = `school_erp_aurora_backup_${todayStr}.json`;
  a.click();
}

function restoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target.result);
      const tx = db.transaction(['students', 'cashbook', 'staff', 'utilities', 'audit', 'attendance', 'settings'], 'readwrite');
      if (d.schoolBrand) tx.objectStore('settings').put({ key: 'branding', ...d.schoolBrand });
      (d.students || []).forEach(x => tx.objectStore('students').put(x));
      (d.cashbook || []).forEach(x => tx.objectStore('cashbook').put(x));
      (d.staffList || []).forEach(x => tx.objectStore('staff').put(x));
      (d.utilities || []).forEach(x => tx.objectStore('utilities').put(x));
      (d.auditLogs || []).forEach(x => tx.objectStore('audit').put(x));
      (d.attendance || []).forEach(x => tx.objectStore('attendance').put(x));
      tx.oncomplete = () => {
        loadAllData();
        alert('Full Backup Restored Successfully!');
      };
    } catch (err) {
      alert('Error restoring backup file: ' + err.message);
    }
  };
  r.readAsText(file);
}

function openWipeSecurityModal() {
  if (currentUserRole !== 'Principal') {
    alert('Restricted: Only Principal can access Wipe Security.');
    return;
  }
  document.getElementById('wipeModal').classList.add('open');
  document.getElementById('wAdminUser').value = '';
  document.getElementById('wAdminPass').value = '';
  document.getElementById('wPhrase').value = '';
}

function executeProtectedWipe() {
  const u = document.getElementById('wAdminUser').value.trim();
  const p = document.getElementById('wAdminPass').value.trim();
  const phrase = document.getElementById('wPhrase').value.trim();

  if (u.toLowerCase() !== (schoolBrand.adminUser || '').toLowerCase() || p !== schoolBrand.adminPass) {
    alert('Verification Failed: Incorrect Principal Username or Password!');
    return;
  }
  if (phrase !== 'CONFIRM-WIPE') {
    alert('Verification Failed: You must type CONFIRM-WIPE in exact capital letters.');
    return;
  }

  const tx = db.transaction(['students', 'cashbook', 'staff', 'utilities', 'attendance'], 'readwrite');
  tx.objectStore('students').clear();
  tx.objectStore('cashbook').clear();
  tx.objectStore('staff').clear();
  tx.objectStore('utilities').clear();
  tx.objectStore('attendance').clear();
  tx.oncomplete = () => {
    logAuditEvent('CRITICAL: Executed Full Database Wipe Verified by Principal');
    closeModal('wipeModal');
    loadAllData();
    alert('All school data has been permanently wiped.');
  };
}

// Bootstrap application database
initDB().then(loadAllData).catch(err => {
  console.error('Failed to initialize database:', err);
});
