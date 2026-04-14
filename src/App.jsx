import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, Users, Calendar, Settings, LogOut, Plus, Edit, Trash2,
  Printer, Smartphone, Download, Upload, Bell, Search, CheckCircle,
  AlertTriangle, Clock, X, MessageCircle, FileText, Sparkles, Send, Loader2,
  ClipboardList, CalendarDays, MapPin, ShieldCheck
} from 'lucide-react';

// ==========================================
// 1. إعدادات النظام والذكاء الاصطناعي
// ==========================================
const apiKey = "AIzaSyAYaLlkQLbVwtBIyStYGHxKpYvmrx2OZ7s"; // سيتم توفيره من بيئة التشغيل تلقائياً

async function callGemini(prompt, systemInstruction = "") {
  let retries = 0;
  const maxRetries = 5;
  const delays = [1000, 2000, 4000, 8000, 16000];

  while (retries < maxRetries) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "لا يمكن استخراج رد.";
      }

      if (response.status === 429 || response.status >= 500) {
        await new Promise(res => setTimeout(res, delays[retries]));
        retries++;
      } else {
        return "حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.";
      }
    } catch (error) {
      await new Promise(res => setTimeout(res, delays[retries]));
      retries++;
    }
  }
  return "فشل الاتصال بالذكاء الاصطناعي بعد عدة محاولات.";
}

async function parseOrderWithAI(rawText) {
  const prompt = `
    قم بتحليل رسالة العميل التالية واستخرج البيانات المطلوبة بدقة:
    "${rawText}"
    
    أجب بصيغة JSON فقط، بدون أي نصوص أو شروحات إضافية، بالشكل التالي:
    {
      "name": "اسم العميل المستخرج",
      "address": "العنوان بالكامل",
      "phone": "رقم الهاتف",
      "date": "التاريخ بصيغة YYYY-MM-DD وإذا لم يذكر ضع تاريخ اليوم",
      "time": "الوقت بنظام 24 ساعة HH:mm وإذا لم يذكر اتركه فارغا",
      "notes": "أي تفاصيل أخرى مثل الدور أو الشقة أو الملاحظات"
    }
  `;
  try {
    const response = await callGemini(prompt, "أنت مساعد ذكي متخصص في استخراج بيانات العملاء. أجب فقط باستخدام JSON.");
    
    // التأكد من عدم وجود رسالة خطأ نصية
    if (!response || response.includes("خطأ") || response.includes("فشل")) {
      return null;
    }

    // استخراج الـ JSON بشكل آمن حتى لو تم إرجاع نص إضافي
    const cleanJson = response.replace(/```json|```/gi, "").trim();
    const startIndex = cleanJson.indexOf('{');
    const endIndex = cleanJson.lastIndexOf('}');
    
    if (startIndex !== -1 && endIndex !== -1) {
      const jsonString = cleanJson.substring(startIndex, endIndex + 1);
      return JSON.parse(jsonString);
    }
    
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("AI Parsing Error:", e);
    return null;
  }
}

// ==========================================
// 2. الدوال المساعدة (Helpers)
// ==========================================
const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);

const format12Hour = (time24) => {
  if (!time24) return '--:--';
  const [hours, minutes] = time24.split(':');
  let h = parseInt(hours, 10);
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'مساءً' : 'صباحاً';
  h = h % 12;
  h = h ? h : 12; 
  return `${h}:${minutes} ${ampm}`;
};

const calculateFollowUps = (firstVisitDate) => {
  if (!firstVisitDate) return [];
  const date = new Date(firstVisitDate);
  if (isNaN(date.getTime())) return []; // منع خطأ التاريخ غير الصالح
  
  const followUps = [];
  const intervals = [3, 6, 9, 12]; // بالشهور
  intervals.forEach(months => {
    const newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() + months);
    followUps.push({ 
      id: generateId(), 
      date: newDate.toISOString().split('T')[0], 
      status: 'pending', 
      period: `${months} شهور` 
    });
  });
  return followUps;
};

const isOverdue = (dateString) => {
  if (!dateString) return false;
  const targetDate = new Date(dateString);
  targetDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return targetDate.getTime() < today.getTime();
};

// ==========================================
// 3. المكون الرئيسي (App)
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [manualFollowUps, setManualFollowUps] = useState([]);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // تحميل البيانات من LocalStorage عند بدء التطبيق
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('pest_user');
      const storedUsers = localStorage.getItem('pest_users');
      const storedClients = localStorage.getItem('pest_clients');
      const storedManual = localStorage.getItem('pest_manual_followups');
      
      if (storedUser) setUser(JSON.parse(storedUser));
      if (storedUsers) setUsers(JSON.parse(storedUsers));
      else setUsers([{ id: 'admin1', username: 'admin', password: '123', role: 'admin' }]);
      if (storedClients) setClients(JSON.parse(storedClients));
      if (storedManual) setManualFollowUps(JSON.parse(storedManual));
    } catch (e) {
      console.error("Error parsing local storage", e);
    }
  }, []);

  // حفظ البيانات عند أي تغيير
  useEffect(() => {
    localStorage.setItem('pest_clients', JSON.stringify(clients));
    localStorage.setItem('pest_manual_followups', JSON.stringify(manualFollowUps));
    localStorage.setItem('pest_users', JSON.stringify(users));
  }, [clients, manualFollowUps, users]);

  // التحقق من تسجيل الدخول
  if (!user) {
    return <LoginView users={users} setUsers={setUsers} onLogin={(u) => { setUser(u); localStorage.setItem('pest_user', JSON.stringify(u)); return true; }} />;
  }

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('pest_user');
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans" dir="rtl">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 right-0 z-50 w-64 bg-green-700 text-white transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} shadow-xl`}>
        <div className="p-4 border-b border-green-600 flex justify-between items-center">
          <div className="flex items-center gap-2 font-bold text-xl"><AlertTriangle size={24}/> كلين كنترول</div>
          <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}><X/></button>
        </div>
        <nav className="p-4 space-y-2 overflow-y-auto h-[calc(100vh-140px)]">
          <SidebarItem icon={Home} label="لوحة القيادة" active={currentView === 'dashboard'} onClick={() => {setCurrentView('dashboard'); setIsSidebarOpen(false);}} />
          <SidebarItem icon={Users} label="العملاء" active={currentView === 'clients'} onClick={() => {setCurrentView('clients'); setIsSidebarOpen(false);}} />
          <SidebarItem icon={Calendar} label="المتابعات الدورية" active={currentView === 'followups'} onClick={() => {setCurrentView('followups'); setIsSidebarOpen(false);}} />
          <SidebarItem icon={CalendarDays} label="الجدول اليومي" active={currentView === 'daily_schedule'} onClick={() => {setCurrentView('daily_schedule'); setIsSidebarOpen(false);}} />
          <SidebarItem icon={Sparkles} label="المساعد الذكي" active={currentView === 'ai_assistant'} onClick={() => {setCurrentView('ai_assistant'); setIsSidebarOpen(false);}} />
          <SidebarItem icon={Settings} label="الإعدادات" active={currentView === 'settings'} onClick={() => {setCurrentView('settings'); setIsSidebarOpen(false);}} />
        </nav>
        <div className="absolute bottom-0 w-full p-4 border-t border-green-600 bg-green-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center font-bold">{user.username?.charAt(0).toUpperCase()}</div>
            <div className="text-sm font-bold">{user.username}</div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-green-100 hover:text-white transition w-full text-sm"><LogOut size={16}/> تسجيل الخروج</button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden print:bg-white print:h-auto">
        <header className="bg-white shadow-sm p-4 flex items-center justify-between print:hidden border-b border-gray-100 z-10">
          <button className="lg:hidden text-green-700 p-2" onClick={() => setIsSidebarOpen(true)}><ClipboardList/></button>
          <div className="text-xl font-bold text-green-800 truncate">
            {currentView === 'dashboard' && 'لوحة القيادة الإحصائية'}
            {currentView === 'clients' && 'إدارة قاعدة بيانات العملاء'}
            {currentView === 'followups' && 'سجل المتابعات التلقائية'}
            {currentView === 'daily_schedule' && 'جدول التشغيل الميداني'}
            {currentView === 'ai_assistant' && 'المساعد الذكي Gemini ✨'}
            {currentView === 'settings' && 'إعدادات النظام'}
          </div>
          <div className="hidden md:flex w-10 h-10 rounded-full bg-green-100 items-center justify-center text-green-700 font-bold">
            {user.username?.charAt(0).toUpperCase()}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 print:p-0 print:bg-white relative">
          {currentView === 'dashboard' && <DashboardView clients={clients} manualFollowUps={manualFollowUps} />}
          {currentView === 'clients' && <ClientsView clients={clients} setClients={setClients} manualFollowUps={manualFollowUps} setManualFollowUps={setManualFollowUps} />}
          {currentView === 'followups' && <FollowUpsView clients={clients} setClients={setClients} />}
          {currentView === 'daily_schedule' && <DailyScheduleView manualFollowUps={manualFollowUps} setManualFollowUps={setManualFollowUps} clients={clients} setClients={setClients} />}
          {currentView === 'ai_assistant' && <AIAssistantView />}
          {currentView === 'settings' && <SettingsView clients={clients} setClients={setClients} manualFollowUps={manualFollowUps} setManualFollowUps={setManualFollowUps} users={users} setUsers={setUsers} />}
        </main>
      </div>
    </div>
  );
}

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${active ? 'bg-green-800 shadow-md border-r-4 border-white' : 'hover:bg-green-600 border-r-4 border-transparent'}`}>
    <Icon size={20} /> <span className="font-medium text-sm md:text-base">{label}</span>
  </button>
);

// ==========================================
// 4. صفحة تسجيل الدخول
// ==========================================
function LoginView({ users, setUsers, onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) return setError('يرجى ملء جميع الحقول');

    if (isRegistering) {
      if (users.find(u => u.username === username)) return setError('اسم المستخدم موجود مسبقاً');
      const newUser = { id: generateId(), username, password, role: 'user' };
      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      localStorage.setItem('pest_users', JSON.stringify(updatedUsers));
      setIsRegistering(false);
      setError('تم التسجيل بنجاح! يمكنك الدخول الآن.');
    } else {
      const user = users.find(u => u.username === username && u.password === password);
      if (user) onLogin(user);
      else setError('البيانات غير صحيحة');
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100 font-sans" dir="rtl">
      <div className="bg-white p-8 md:p-10 rounded-3xl shadow-2xl w-full max-w-md mx-4 text-center border border-white">
        <div className="w-20 h-20 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
          <AlertTriangle size={40} className="text-white -rotate-3"/>
        </div>
        <h1 className="text-3xl font-bold mb-2 text-gray-800">كلين كنترول</h1>
        <p className="text-gray-500 mb-8">{isRegistering ? 'تسجيل حساب موظف جديد' : 'نظام الإدارة الذكي لمكافحة الحشرات'}</p>
        
        {error && <div className={`mb-4 p-3 rounded-lg text-sm ${error.includes('بنجاح') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4 text-right">
           <input type="text" placeholder="اسم المستخدم" className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={username} onChange={e=>setUsername(e.target.value)}/>
           <input type="password" placeholder="كلمة المرور" className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={password} onChange={e=>setPassword(e.target.value)}/>
           <button type="submit" className="w-full bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-700 transition shadow-lg active:scale-95">
             {isRegistering ? 'إنشاء حساب' : 'دخول للنظام'}
           </button>
        </form>
        <button onClick={() => { setIsRegistering(!isRegistering); setError(''); }} className="mt-6 text-sm text-green-600 hover:underline">
          {isRegistering ? 'لديك حساب بالفعل؟ تسجيل دخول' : 'إضافة موظف جديد بالنظام'}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 5. لوحة القيادة (Dashboard)
// ==========================================
function DashboardView({ clients, manualFollowUps }) {
  const today = new Date().toISOString().split('T')[0];
  
  const stats = useMemo(() => {
    const todayTasks = manualFollowUps.filter(f => f.date === today);
    const pendingTasks = manualFollowUps.filter(f => !f.completed);
    const rev = clients.reduce((sum, c) => sum + (parseFloat(c.amountPaid) || 0), 0);
    return {
      totalClients: clients.length,
      tasksToday: todayTasks.length,
      pendingTasks: pendingTasks.length,
      revenue: rev
    };
  }, [clients, manualFollowUps, today]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard icon={Users} title="إجمالي العملاء" value={stats.totalClients} color="blue" />
        <DashboardCard icon={CalendarDays} title="زيارات اليوم" value={stats.tasksToday} color="green" />
        <DashboardCard icon={Clock} title="مهام معلقة" value={stats.pendingTasks} color="yellow" />
        <DashboardCard icon={FileText} title="إجمالي الإيرادات" value={`${stats.revenue} ج`} color="indigo" />
      </div>
      <div className="bg-gradient-to-l from-green-600 to-green-800 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden">
         <div className="relative z-10">
           <h3 className="text-xl font-bold mb-2 flex items-center gap-2"><Sparkles className="text-yellow-400"/> نظام الإدخال الذكي يعمل</h3>
           <p className="text-green-100 text-sm md:text-base leading-relaxed mb-4 max-w-2xl">
             يمكنك الآن نسخ رسالة الواتساب الخاصة بالعميل (التي تحتوي على الاسم والعنوان والموعد) ولصقها في نافذة "الإدخال الذكي" ليقوم الذكاء الاصطناعي بتنظيمها وتسجيلها فوراً.
           </p>
         </div>
         <ShieldCheck className="absolute -bottom-10 -left-10 text-green-500 opacity-20 w-48 h-48"/>
      </div>
    </div>
  );
}

const DashboardCard = ({ icon: Icon, title, value, color }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  };
  return (
    <div className={`p-6 rounded-2xl border ${colors[color]} shadow-sm flex items-center gap-4 hover:shadow-md transition`}>
      <div className={`p-3 rounded-xl bg-white shadow-sm`}><Icon size={24}/></div>
      <div>
        <p className="text-xs text-gray-500 font-bold mb-1">{title}</p>
        <p className="text-xl md:text-2xl font-bold text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
};

// ==========================================
// 6. المودال الذكي للإدخال السريع (AI Parsing)
// ==========================================
function QuickAddModal({ onClose, onParsed }) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveOption, setSaveOption] = useState('both'); // 'both', 'client', 'schedule'

  const handleAnalyze = async () => {
    setLoading(true);
    const data = await parseOrderWithAI(rawText);
    setLoading(false);
    
    if (data) {
      onParsed(data, saveOption);
      onClose();
    } else {
      alert("تعذر تحليل الرسالة. تأكد من وجود بيانات واضحة وتفعيل مفتاح API.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-lg p-6 md:p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 left-6 text-gray-400 hover:text-red-500 bg-gray-100 p-2 rounded-full"><X size={20}/></button>
        <h3 className="font-bold text-xl mb-6 flex items-center gap-2 text-green-800">
          <Sparkles className="text-green-600"/> إدخال سريع بالذكاء الاصطناعي
        </h3>
        
        <textarea 
          className="w-full p-4 border border-gray-200 rounded-xl h-40 outline-none focus:ring-2 focus:ring-green-500 bg-gray-50 mb-4 text-sm"
          placeholder="انسخ الرسالة هنا... (مثال: أحمد محمد، 33 شارع بغداد، 01004793080، الساعة 3 عصراً)"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        
        <div className="mb-6 space-y-2 text-sm font-bold text-gray-700">
          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
            <input type="radio" name="saveOpt" checked={saveOption === 'both'} onChange={() => setSaveOption('both')} className="w-4 h-4 text-green-600" />
            تسجيل كعميل جديد + إضافة لجدول اليوم (موصى به)
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
            <input type="radio" name="saveOpt" checked={saveOption === 'client'} onChange={() => setSaveOption('client')} className="w-4 h-4 text-green-600" />
            تسجيل في قاعدة العملاء فقط
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
            <input type="radio" name="saveOpt" checked={saveOption === 'schedule'} onChange={() => setSaveOption('schedule')} className="w-4 h-4 text-green-600" />
            إضافة لجدول التشغيل اليومي فقط
          </label>
        </div>

        <button 
          onClick={handleAnalyze}
          disabled={loading || !rawText.trim()}
          className="w-full bg-green-600 text-white py-4 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-green-700 disabled:opacity-50 transition shadow-lg"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
          {loading ? 'جاري التحليل...' : 'استخراج وتسجيل تلقائي'}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 7. إدارة العملاء
// ==========================================
function ClientsView({ clients, setClients, manualFollowUps, setManualFollowUps }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);

  const handleSaveClient = (clientData) => {
    if (editingClient) {
      setClients(clients.map(c => c.id === editingClient.id ? { ...c, ...clientData } : c));
    } else {
      const newClient = {
        id: generateId(),
        ...clientData,
        followUps: calculateFollowUps(clientData.firstVisit)
      };
      setClients([newClient, ...clients]);
    }
    setIsModalOpen(false);
    setEditingClient(null);
  };

  const handleAIParsed = (data, saveOption) => {
    const defaultDate = new Date().toISOString().split('T')[0];
    
    // إنشاء كائن العميل
    const newClient = {
      id: generateId(),
      name: data.name || 'غير معروف',
      phone: data.phone || '',
      address: data.address || '',
      firstVisit: data.date || defaultDate,
      amountPaid: '',
      notes: data.notes || '',
      followUps: calculateFollowUps(data.date || defaultDate)
    };

    // إنشاء كائن المهمة اليومية
    const newTask = {
      id: generateId(),
      clientName: data.name || 'غير معروف',
      phone: data.phone || '',
      address: data.address || '',
      date: data.date || defaultDate,
      time: data.time || '',
      note: data.notes || '',
      completed: false
    };

    if (saveOption === 'both' || saveOption === 'client') {
      setClients(prev => [newClient, ...prev]);
    }
    if (saveOption === 'both' || saveOption === 'schedule') {
      setManualFollowUps(prev => [newTask, ...prev]);
    }
    
    alert("تم الإدخال بنجاح!");
  };

  const filteredClients = clients.filter(c => 
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.phone || '').includes(searchTerm)
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute right-3 top-3 text-gray-400" size={20} />
          <input type="text" placeholder="بحث بالاسم أو رقم الهاتف..." className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={() => setShowQuickAdd(true)} className="flex-1 md:flex-none bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg flex justify-center items-center gap-2 shadow-md transition font-bold text-sm">
            <Sparkles size={18} /> إدخال ذكي
          </button>
          <button onClick={() => { setEditingClient(null); setIsModalOpen(true); }} className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg flex justify-center items-center gap-2 shadow-md transition font-bold text-sm">
            <Plus size={18} /> إضافة يدوي
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredClients.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100">لا توجد بيانات مطابقة.</div>
        ) : (
          filteredClients.map(client => (
            <div key={client.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-lg text-gray-800 line-clamp-1">{client.name || 'بدون اسم'}</h3>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingClient(client); setIsModalOpen(true); }} className="text-blue-500 p-1.5 rounded-md hover:bg-blue-50 transition"><Edit size={16} /></button>
                  <button onClick={() => { if(window.confirm('هل أنت متأكد من الحذف؟')) setClients(clients.filter(c => c.id !== client.id)); }} className="text-red-500 p-1.5 rounded-md hover:bg-red-50 transition"><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="space-y-2 text-sm text-gray-600 mb-5">
                <p className="flex items-center gap-2"><Smartphone size={16} className="text-green-600"/> <span dir="ltr" className="font-medium">{client.phone || '-'}</span></p>
                <p className="flex items-center gap-2"><Calendar size={16} className="text-green-600"/> <span>الزيارة: {client.firstVisit || '-'}</span></p>
                <p className="flex items-center gap-2"><MapPin size={16} className="text-green-600"/> <span className="truncate">{client.address || '-'}</span></p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelectedClient(client)} className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-bold transition">التفاصيل / الطباعة</button>
                {client.phone && (
                  <a href={`https://wa.me/2${client.phone.replace(/^0+/, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-12 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition">
                    <MessageCircle size={18} />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showQuickAdd && <QuickAddModal onClose={() => setShowQuickAdd(false)} onParsed={handleAIParsed} />}
      {isModalOpen && <ClientFormModal client={editingClient} onClose={() => setIsModalOpen(false)} onSave={handleSaveClient} />}
      {selectedClient && <ClientDetailsModal client={selectedClient} onClose={() => setSelectedClient(null)} onEdit={() => { setSelectedClient(null); setEditingClient(selectedClient); setIsModalOpen(true); }} />}
    </div>
  );
}

// 7.1 نموذج إدخال العملاء اليدوي
function ClientFormModal({ client, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: client?.name || '', phone: client?.phone || '', address: client?.address || '',
    firstVisit: client?.firstVisit || '', amountPaid: client?.amountPaid || '', notes: client?.notes || ''
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-green-800">{client ? 'تعديل بيانات عميل' : 'إضافة عميل جديد يدوياً'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><X size={20} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div><label className="block text-sm font-bold mb-2 text-gray-700">اسم العميل <span className="text-red-500">*</span></label><input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-gray-50" required /></div>
          <div><label className="block text-sm font-bold mb-2 text-gray-700">رقم الهاتف <span className="text-red-500">*</span></label><input type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-gray-50 text-right" dir="ltr" required /></div>
          <div><label className="block text-sm font-bold mb-2 text-gray-700">العنوان بالتفصيل</label><input type="text" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-gray-50" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-bold mb-2 text-gray-700">أول زيارة (لتوليد المتابعات)</label><input type="date" value={formData.firstVisit} onChange={(e) => setFormData({...formData, firstVisit: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none bg-gray-50" disabled={!!client} /></div>
            <div><label className="block text-sm font-bold mb-2 text-gray-700">المبلغ المدفوع (ج)</label><input type="number" value={formData.amountPaid} onChange={(e) => setFormData({...formData, amountPaid: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none bg-gray-50" /></div>
          </div>
          <div><label className="block text-sm font-bold mb-2 text-gray-700">ملاحظات العمل</label><textarea rows="3" value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-gray-50"></textarea></div>
          <div className="flex gap-3 pt-6">
            <button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg transition">حفظ بيانات العميل</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 7.2 نافذة تفاصيل العميل والطباعة (Client Details)
function ClientDetailsModal({ client, onClose, onEdit }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col print:shadow-none print:max-w-full">
        {/* أزرار التحكم - مخفية في الطباعة */}
        <div className="flex justify-between items-center p-6 border-b bg-gray-50 print:hidden">
          <h2 className="text-xl font-bold text-gray-800">ملف العميل الموحد</h2>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="bg-gray-800 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-black transition shadow-md"><Printer size={18} /> طباعة A4</button>
            <button onClick={onEdit} className="bg-blue-100 text-blue-700 font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-200 transition"><Edit size={18} /> تعديل</button>
            <button onClick={onClose} className="text-gray-500 hover:text-red-500 bg-white p-2 rounded-lg shadow-sm border"><X size={20} /></button>
          </div>
        </div>
        
        {/* محتوى الطباعة */}
        <div className="p-6 md:p-8 overflow-y-auto print:p-8" id="print-client-area">
          <div className="hidden print:flex flex-col items-center mb-8 border-b-2 border-green-700 pb-4">
            <h1 className="text-4xl font-bold text-green-800 mb-1">كلين كنترول</h1>
            <p className="text-gray-600 font-bold text-lg">نظام الإدارة - ملف العميل</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 print:border-2 print:border-gray-300 print:bg-white"><p className="text-sm text-gray-500 mb-1 font-bold">الاسم</p><p className="font-bold text-lg text-gray-900">{client.name}</p></div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 print:border-2 print:border-gray-300 print:bg-white"><p className="text-sm text-gray-500 mb-1 font-bold">رقم الهاتف</p><p className="font-bold text-lg text-gray-900" dir="ltr">{client.phone || 'غير مسجل'}</p></div>
            <div className="col-span-1 md:col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100 print:border-2 print:border-gray-300 print:bg-white"><p className="text-sm text-gray-500 mb-1 font-bold">العنوان التفصيلي</p><p className="font-bold text-gray-900">{client.address || 'غير مسجل'}</p></div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 print:border-2 print:border-gray-300 print:bg-white"><p className="text-sm text-gray-500 mb-1 font-bold">تاريخ الزيارة الأولى</p><p className="font-bold text-gray-900">{client.firstVisit || '-'}</p></div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 print:border-2 print:border-gray-300 print:bg-white"><p className="text-sm text-gray-500 mb-1 font-bold">المبلغ المدفوع</p><p className="font-bold text-gray-900">{client.amountPaid ? `${client.amountPaid} ج.م` : '-'}</p></div>
          </div>
          
          {client.notes && (
            <div className="bg-yellow-50 p-5 rounded-xl mb-8 border border-yellow-200 print:border-2 print:border-gray-300 print:bg-white">
              <p className="text-sm text-yellow-800 font-bold mb-2 print:text-black">ملاحظات فنية والخدمات المقدمة</p>
              <p className="text-base whitespace-pre-wrap text-yellow-900 print:text-black">{client.notes}</p>
            </div>
          )}
          
          <h3 className="font-bold text-lg border-b-2 border-gray-200 pb-3 mb-4 text-green-800 print:text-black print:border-black">سجل المتابعات الدورية (التلقائية)</h3>
          {(!client.followUps || client.followUps.length === 0) ? (
             <p className="text-gray-500 text-sm">لم يتم تحديد تاريخ أول زيارة لإنشاء متابعات.</p>
          ) : (
            <table className="w-full text-right text-sm border-collapse print:border-2 print:border-black">
              <thead><tr className="bg-gray-100 print:bg-gray-200"><th className="p-3 border print:border-black print:border-2 font-bold">الفترة</th><th className="p-3 border print:border-black print:border-2 font-bold">التاريخ المتوقع</th><th className="p-3 border print:border-black print:border-2 font-bold">حالة الزيارة</th></tr></thead>
              <tbody>
                {client.followUps?.map(fu => (
                  <tr key={fu.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 border print:border-black print:border-2 font-bold text-gray-800">بعد {fu.period}</td>
                    <td className="p-3 border print:border-black print:border-2 font-medium" dir="ltr">{fu.date}</td>
                    <td className="p-3 border print:border-black print:border-2">
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-bold print:border print:px-2 print:py-1 ${fu.status === 'completed' ? 'bg-green-100 text-green-700 print:border-green-800 print:text-black' : 'bg-yellow-100 text-yellow-700 print:border-gray-400 print:text-black'}`}>
                        {fu.status === 'completed' ? 'تمت الزيارة بنجاح' : 'معلقة / قيد الانتظار'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          
          <div className="hidden print:block mt-16 pt-6 border-t-2 border-black flex justify-between font-bold text-lg">
            <div className="w-1/2 text-center">توقيع العميل المستلم</div>
            <div className="w-1/2 text-center">توقيع الفني / المهندس</div>
          </div>
        </div>
      </div>
      {/* ستايل لضمان طباعة نافذة المودال فقط */}
      <style>{`
        @media print { 
          body > *:not(.fixed) { display: none; } 
          .fixed { position: static; background: transparent; }
          #print-client-area { margin: 0; padding: 0; }
        }
      `}</style>
    </div>
  );
}

// ==========================================
// 8. سجل المتابعات الدورية (التلقائية)
// ==========================================
function FollowUpsView({ clients, setClients }) {
  const [filter, setFilter] = useState('all');
  
  const allFollowUps = useMemo(() => {
    let list = [];
    clients.forEach(client => {
      client.followUps?.forEach(fu => {
        list.push({ ...fu, clientId: client.id, clientName: client.name, clientPhone: client.phone });
      });
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [clients]);

  const filteredFollowUps = allFollowUps.filter(f => {
    if (filter === 'upcoming') return f.status === 'pending' && !isOverdue(f.date);
    if (filter === 'overdue') return f.status === 'pending' && isOverdue(f.date);
    return true;
  });

  const toggleStatus = (clientId, fuId, currentStatus) => {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, followUps: c.followUps.map(f => f.id === fuId ? { ...f, status: newStatus } : f) } : c));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex gap-2 overflow-x-auto">
        <button onClick={() => setFilter('all')} className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${filter === 'all' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>جميع المتابعات</button>
        <button onClick={() => setFilter('upcoming')} className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${filter === 'upcoming' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>متابعات قادمة</button>
        <button onClick={() => setFilter('overdue')} className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${filter === 'overdue' ? 'bg-red-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>متابعات متأخرة</button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-right min-w-[700px] border-collapse">
          <thead className="bg-gray-50 border-b">
            <tr><th className="p-4 border-b font-bold text-gray-700">اسم العميل</th><th className="p-4 border-b font-bold text-gray-700">تاريخ المتابعة</th><th className="p-4 border-b font-bold text-gray-700">تواصل سريع</th><th className="p-4 border-b text-center font-bold text-gray-700">الإجراء</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredFollowUps.length === 0 ? (
              <tr><td colSpan="4" className="p-10 text-center text-gray-500 font-medium">لا توجد متابعات مطابقة.</td></tr>
            ) : (
              filteredFollowUps.map(fu => (
                <tr key={fu.id} className={`hover:bg-gray-50 transition ${isOverdue(fu.date) && fu.status === 'pending' ? 'bg-red-50/50' : ''}`}>
                  <td className="p-4 font-bold text-gray-800">{fu.clientName}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                       <span dir="ltr" className={`text-sm font-bold ${isOverdue(fu.date) && fu.status === 'pending' ? 'text-red-600' : 'text-gray-600'}`}>{fu.date}</span>
                       {isOverdue(fu.date) && fu.status === 'pending' && <AlertTriangle size={14} className="text-red-500"/>}
                    </div>
                  </td>
                  <td className="p-4">
                    {fu.clientPhone && <a href={`https://wa.me/2${fu.clientPhone.replace(/^0+/, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-10 h-10 bg-green-100 text-green-700 hover:bg-green-200 rounded-xl transition shadow-sm"><MessageCircle size={18} /></a>}
                  </td>
                  <td className="p-4 text-center">
                    <button onClick={() => toggleStatus(fu.clientId, fu.id, fu.status)} className={`px-4 py-2 rounded-xl text-sm font-bold transition shadow-sm ${fu.status === 'completed' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                      {fu.status === 'completed' ? 'إلغاء التأكيد' : 'تأكيد إتمام الزيارة'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 9. جدول التشغيل الميداني (Daily Schedule) للطباعة
// ==========================================
function DailyScheduleView({ manualFollowUps, setManualFollowUps, clients, setClients }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const dailyTasks = useMemo(() => {
    return manualFollowUps
      .filter(item => item.date === selectedDate)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [manualFollowUps, selectedDate]);

  const handleManualAdd = (task) => {
    setManualFollowUps([...manualFollowUps, { ...task, id: generateId(), date: selectedDate, completed: false }]);
    setShowAddModal(false);
  };

  const handleAIParsed = (data, saveOption) => {
    const newTask = {
      id: generateId(),
      clientName: data.name || 'غير معروف',
      phone: data.phone || '',
      address: data.address || '',
      date: selectedDate, // نعطيه تاريخ اليوم المختار في الجدول
      time: data.time || '',
      note: data.notes || '',
      completed: false
    };
    if (saveOption === 'both' || saveOption === 'schedule') {
      setManualFollowUps(prev => [newTask, ...prev]);
    }
    if (saveOption === 'both' || saveOption === 'client') {
      const newClient = {
        id: generateId(), name: data.name || '', phone: data.phone || '', address: data.address || '',
        firstVisit: selectedDate, amountPaid: '', notes: data.notes || '', followUps: calculateFollowUps(selectedDate)
      };
      setClients(prev => [newClient, ...prev]);
    }
    alert("تمت الإضافة للجدول بنجاح!");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end print:hidden">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-bold text-gray-700 mb-2">اختر تاريخ الجدول للعرض والطباعة:</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-gray-700" />
        </div>
        <button onClick={() => setShowQuickAdd(true)} className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-purple-700 transition shadow-md"><Sparkles size={18}/> رسالة ذكية</button>
        <button onClick={() => setShowAddModal(true)} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 transition shadow-md"><Plus size={18}/> مهمة يدوية</button>
        <button onClick={() => window.print()} className="bg-gray-800 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-black transition shadow-md"><Printer size={18}/> طباعة A4</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden print:shadow-none print:border-none">
        <div className="p-4 bg-green-50 border-b flex justify-between items-center print:bg-white print:border-b-2 print:border-black">
          <h2 className="font-bold text-lg text-green-800">مهام وزيارات يوم: <span dir="ltr">{selectedDate}</span></h2>
          <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full font-bold print:hidden">{dailyTasks.length} مهام مبرمجة</span>
        </div>
        <div className="overflow-x-auto">
          {dailyTasks.length === 0 ? (
            <div className="p-12 text-center text-gray-400 font-bold">لا توجد زيارات مبرمجة في هذا التاريخ.</div>
          ) : (
            <table className="w-full text-right border-collapse">
              <thead className="bg-gray-50 border-b">
                <tr><th className="p-4 border text-sm font-bold text-gray-700">الوقت</th><th className="p-4 border text-sm font-bold text-gray-700">العميل</th><th className="p-4 border text-sm font-bold text-gray-700">رقم الهاتف</th><th className="p-4 border text-sm font-bold text-gray-700">العنوان</th><th className="p-4 border text-sm font-bold text-gray-700">الخدمة المطلوبة (ملاحظات)</th><th className="p-4 border text-sm text-center print:hidden">حذف</th></tr>
              </thead>
              <tbody>
                {dailyTasks.map(task => (
                  <tr key={task.id} className="hover:bg-gray-50 transition border-b">
                    <td className="p-4 border font-bold text-green-700 whitespace-nowrap">{format12Hour(task.time)}</td>
                    <td className="p-4 border font-bold text-gray-800">{task.clientName}</td>
                    <td className="p-4 border font-medium text-gray-600" dir="ltr">{task.phone || '-'}</td>
                    <td className="p-4 border text-sm text-gray-700">{task.address || '-'}</td>
                    <td className="p-4 border text-sm text-gray-600 max-w-xs leading-relaxed">{task.note || '-'}</td>
                    <td className="p-4 border text-center print:hidden">
                      <button onClick={() => { if(window.confirm('إلغاء هذه المهمة؟')) setManualFollowUps(manualFollowUps.filter(i => i.id !== task.id)) }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"><Trash2 size={18}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* تصميم مخصص للطباعة فقط A4 */}
      <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 font-sans" dir="rtl">
        <div className="flex justify-between items-start border-b-4 border-green-800 pb-4 mb-6">
          <div><h1 className="text-4xl font-bold text-green-800">كلين كنترول</h1><p className="text-black font-bold mt-2 text-xl">تقرير التشغيل والمتابعات الميدانية</p></div>
          <div className="text-left"><p className="text-xl font-bold">تاريخ المهمة: <span dir="ltr">{selectedDate}</span></p><p className="text-sm text-gray-600 mt-1">مستخرج آلياً من النظام</p></div>
        </div>
        <table className="w-full border-collapse border-2 border-black text-base">
          <thead>
            <tr className="bg-gray-200">
              <th className="border-2 border-black p-3 w-12 font-bold">م</th>
              <th className="border-2 border-black p-3 w-28 font-bold">الوقت</th>
              <th className="border-2 border-black p-3 w-48 font-bold">اسم العميل</th>
              <th className="border-2 border-black p-3 w-36 font-bold">الهاتف</th>
              <th className="border-2 border-black p-3 w-64 font-bold">العنوان التفصيلي</th>
              <th className="border-2 border-black p-3 font-bold">الخدمة والملاحظات</th>
              <th className="border-2 border-black p-3 w-32 font-bold">التوقيع بالاستلام</th>
            </tr>
          </thead>
          <tbody>
            {dailyTasks.map((task, idx) => (
              <tr key={task.id} className="min-h-[80px]">
                <td className="border-2 border-black p-3 text-center font-bold text-lg">{idx + 1}</td>
                <td className="border-2 border-black p-3 text-center font-bold whitespace-nowrap">{format12Hour(task.time)}</td>
                <td className="border-2 border-black p-3 font-bold text-lg">{task.clientName}</td>
                <td className="border-2 border-black p-3 text-center font-bold" dir="ltr">{task.phone}</td>
                <td className="border-2 border-black p-3 text-sm leading-relaxed">{task.address}</td>
                <td className="border-2 border-black p-3 text-sm">{task.note}</td>
                <td className="border-2 border-black p-3"></td>
              </tr>
            ))}
            {/* إضافة صفوف فارغة لإكمال الورقة */}
            {[...Array(Math.max(0, 10 - dailyTasks.length))].map((_, i) => (
              <tr key={`empty-${i}`} className="h-20">
                <td className="border-2 border-black p-3"></td><td className="border-2 border-black p-3"></td><td className="border-2 border-black p-3"></td>
                <td className="border-2 border-black p-3"></td><td className="border-2 border-black p-3"></td><td className="border-2 border-black p-3"></td>
                <td className="border-2 border-black p-3"></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-12 flex justify-between items-center font-bold text-xl pt-6">
          <div className="text-center w-72 border-t-2 border-black pt-2">توقيع مهندس/مشرف التشغيل</div>
          <div className="text-center w-72 border-t-2 border-black pt-2">ختم إدارة الشركة</div>
        </div>
      </div>
      <style>{`@media print { body > *:not(.fixed) { display: none; } .fixed { position: static; background: transparent; } }`}</style>

      {showQuickAdd && <QuickAddModal onClose={() => setShowQuickAdd(false)} onParsed={handleAIParsed} />}
      {showAddModal && <ManualTaskModal onClose={() => setShowAddModal(false)} onSave={handleManualAdd} selectedDate={selectedDate} />}
    </div>
  );
}

function ManualTaskModal({ onClose, onSave, selectedDate }) {
  const [task, setTask] = useState({ clientName: '', phone: '', address: '', time: '', note: '' });
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-xl text-green-800">إضافة مهمة ميدانية يدوية</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><X/></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(task); }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-bold mb-1">اسم العميل</label><input type="text" value={task.clientName} onChange={e=>setTask({...task, clientName: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" required /></div>
            <div><label className="block text-sm font-bold mb-1">رقم الهاتف</label><input type="tel" value={task.phone} onChange={e=>setTask({...task, phone: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50 text-right" dir="ltr" /></div>
          </div>
          <div><label className="block text-sm font-bold mb-1">العنوان التفصيلي</label><input type="text" value={task.address} onChange={e=>setTask({...task, address: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-bold mb-1">تاريخ المهمة</label><input type="text" value={selectedDate} disabled className="w-full p-3 border rounded-xl bg-gray-200 text-gray-500 cursor-not-allowed"/></div>
            <div><label className="block text-sm font-bold mb-1">وقت الزيارة</label><input type="time" value={task.time} onChange={e=>setTask({...task, time: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50"/></div>
          </div>
          <div><label className="block text-sm font-bold mb-1">نوع الخدمة والملاحظات</label><textarea value={task.note} onChange={e=>setTask({...task, note: e.target.value})} rows="3" className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50"></textarea></div>
          <div className="flex gap-3 pt-4">
             <button type="submit" className="flex-1 bg-green-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-green-700 transition">إضافة للجدول</button>
             <button type="button" onClick={onClose} className="bg-gray-100 text-gray-800 font-bold py-3.5 px-6 rounded-xl hover:bg-gray-200 transition">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 10. المساعد الذكي المفتوح (AI Assistant)
// ==========================================
function AIAssistantView() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!input) return;
    setLoading(true);
    const res = await callGemini(input, "أنت خبير واستشاري في أعمال شركات مكافحة الحشرات والقوارض في الشرق الأوسط. قدم إجابات مهنية ودقيقة.");
    setResponse(res);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 md:p-8 bg-gradient-to-l from-green-50 to-white border-b flex items-start gap-4">
          <div className="bg-green-600 text-white p-3 rounded-2xl shadow-md"><Sparkles size={28}/></div>
          <div>
            <h2 className="text-2xl font-bold text-green-800 mb-1">المستشار الذكي للمكافحة</h2>
            <p className="text-gray-600">اطلب استشارة فنية حول أنواع المبيدات، طرق مكافحة آفة معينة، أو صياغة رسالة اعتذار لعميل.</p>
          </div>
        </div>
        <div className="p-6 md:p-8 space-y-4">
          <textarea 
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="مثال: كيف أتعامل مع انتشار سوس الخشب في أثاث منزلي قديم؟"
            className="w-full p-5 border border-gray-200 rounded-2xl min-h-[140px] outline-none focus:ring-2 focus:ring-green-500 bg-gray-50 text-gray-800 leading-relaxed"
          />
          <button 
            onClick={handleAsk} disabled={loading || !input.trim()}
            className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50 transition shadow-lg text-lg"
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
            {loading ? 'الذكاء الاصطناعي يحلل...' : 'إرسال الاستفسار الآن'}
          </button>
        </div>
        {response && (
          <div className="p-6 md:p-8 bg-gray-50 border-t border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><CheckCircle className="text-green-600"/> تقرير الذكاء الاصطناعي:</h3>
            <div className="bg-white p-6 rounded-2xl border border-gray-200 text-gray-800 whitespace-pre-wrap leading-loose shadow-sm text-justify">
              {response}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 11. صفحة الإعدادات والنسخ الاحتياطي
// ==========================================
function SettingsView({ clients, setClients, manualFollowUps, setManualFollowUps, users, setUsers }) {
  const exportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ clients, manualFollowUps, users }));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `clean_control_backup_${new Date().toISOString().split('T')[0]}.json`);
    dl.click();
    alert('تم تحميل النسخة الاحتياطية بنجاح.');
  };

  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.clients) setClients(parsed.clients);
        if (parsed.manualFollowUps) setManualFollowUps(parsed.manualFollowUps);
        if (parsed.users) setUsers(parsed.users);
        alert('تم استعادة البيانات بنجاح!');
      } catch (err) { alert('خطأ في الملف المرفوع.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-4 flex items-center gap-2"><Settings className="text-gray-500"/> الإعدادات وحفظ البيانات</h2>
        
        <div className="space-y-8">
          <div>
            <h3 className="font-bold text-lg mb-2 text-blue-800">النسخ الاحتياطي (Backup)</h3>
            <p className="text-gray-600 text-sm mb-4">لأن البيانات تحفظ على المتصفح، يُرجى أخذ نسخة احتياطية بشكل أسبوعي لحمايتها من الضياع.</p>
            <div className="flex flex-wrap gap-4">
              <button onClick={exportData} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-md"><Download size={18}/> تحميل نسخة (تصدير)</button>
              <label className="bg-gray-100 text-gray-800 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-200 shadow-sm border cursor-pointer">
                <Upload size={18}/> رفع نسخة (استيراد)
                <input type="file" accept=".json" onChange={importData} className="hidden"/>
              </label>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-bold text-lg mb-2 text-red-700">المنطقة الخطرة (إعادة ضبط)</h3>
            <p className="text-gray-600 text-sm mb-4">احذر، هذا الزر سيقوم بمسح كل العملاء والمواعيد من جهازك نهائياً.</p>
            <button onClick={() => { if(window.confirm('موافق على مسح النظام بالكامل؟ لا يمكن التراجع!')) { setClients([]); setManualFollowUps([]); } }} className="bg-red-50 text-red-600 border border-red-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-red-100 transition">
              <Trash2 size={18}/> مسح كل بيانات النظام
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}