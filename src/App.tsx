import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import {
  Check, Copy, Upload, X, Lock, LogOut, Eye, Trash2,
  Clock, BadgeCheck, ChevronRight, MessageCircleHeart, Send,
} from 'lucide-react';

// ---------- Firebase ----------
const firebaseConfig = {
  apiKey: 'AIzaSyBNlgyaCnU58wrQcElVIrQdPoeTD7xC5hY',
  authDomain: 'pihu-raiser.firebaseapp.com',
  projectId: 'pihu-raiser',
  storageBucket: 'pihu-raiser.firebasestorage.app',
  messagingSenderId: '175654010185',
  appId: '1:175654010185:web:fd6c69026b94d4c9902e98',
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'pihu-care-fund-app';
const base = ['artifacts', appId, 'public', 'data'] as const;
const donationsCol = () => collection(db, ...base, 'pihu_donations');
const proofDoc = (id: string) => doc(db, ...base, 'pihu_proofs', id);
const proofsCol = () => collection(db, ...base, 'pihu_proofs');
const messagesCol = () => collection(db, ...base, 'pihu_messages');

// ---------- Config ----------
const UPI_ID = '8088256450@fam';

// 3 cascading goals
const GOALS = [
  { amount: 5000, label: 'Basic Necessities', desc: 'Food & essentials for a month', color: '#f59e0b', track: '#fde68a' },
  { amount: 7500, label: 'Necessities + Accessories', desc: 'Comfort & care', color: '#10b981', track: '#a7f3d0' },
  { amount: 10000, label: 'Final Boss', desc: 'Vaccination + Checkup + Food + Toys & Treats', color: '#8b5cf6', track: '#ddd6fe' },
];

// Per-user milestone levels. Level 0 = starting state (Stranger).
const USER_LEVELS = [
  { amount: 0, level: 0, title: 'Stranger', icon: '👤' },
  { amount: 100, level: 1, title: 'Treat Stash', icon: '🐟' },
  { amount: 250, level: 2, title: 'Daily Care', icon: '🧶' },
  { amount: 500, level: 3, title: 'Essentials', icon: '💊' },
  { amount: 1000, level: 4, title: 'Medical Checkup', icon: '🩺' },
  { amount: 2000, level: 5, title: 'Vaccination', icon: '💉' },
];

// Donor title/rank system
const TITLES = [
  { min: 2000, title: "Pihu's Family", icon: '👨‍👩‍👧', perks: true },
  { min: 1000, title: "Pihu's Guardian", icon: '🛡️', perks: false },
  { min: 500, title: 'Cat Lover', icon: '❤️', perks: false },
  { min: 250, title: "Pihu's Admirer", icon: '🌸', perks: false },
  { min: 100, title: 'Friendly Being', icon: '😊', perks: false },
  { min: 1, title: 'Kind Passerby', icon: '🐾', perks: false },
];

// Cat emotions by amount
const CAT_EMOTIONS = [
  { min: 2000, emoji: '😻', mood: 'Over the moon!' },
  { min: 1000, emoji: '😸', mood: 'So happy!' },
  { min: 500, emoji: '😺', mood: 'Very pleased~' },
  { min: 250, emoji: '🙂', mood: 'Warming up…' },
  { min: 100, emoji: '😐', mood: 'Noticing you…' },
  { min: 1, emoji: '🐱', mood: 'A little help?' },
  { min: 0, emoji: '😿', mood: 'Pihu needs you…' },
];

const getTitle = (total: number) =>
  TITLES.find((t) => total >= t.min) ?? { title: 'Kind Passerby', icon: '🐾', perks: false };

const getCatEmotion = (amount: number) =>
  CAT_EMOTIONS.find((c) => amount >= c.min) ?? CAT_EMOTIONS[CAT_EMOTIONS.length - 1];

// Always returns a level (level 0 as minimum — "Stranger")
const getUserLevel = (total: number) =>
  [...USER_LEVELS].reverse().find((l) => total >= l.amount) ?? USER_LEVELS[0];

// ---------- Message credit helpers (persisted in localStorage) ----------
const creditKey = (name: string) => `pihu_msg_credits_${name.trim().toLowerCase()}`;
const getCredits = (name: string): number =>
  name.trim() ? Math.max(0, Number(localStorage.getItem(creditKey(name)) ?? 0)) : 0;
const saveCredits = (name: string, n: number) =>
  localStorage.setItem(creditKey(name), String(Math.max(0, n)));
const addCredits = (name: string, delta: number) =>
  saveCredits(name, getCredits(name) + delta);
const spendCredit = (name: string) =>
  saveCredits(name, getCredits(name) - 1);

// ---------- Non-linear slider ----------
const sliderToAmount = (raw: number): number => {
  if (raw <= 50) return Math.round((raw / 50) * 150);
  return Math.round(150 + ((raw - 50) / (5000 - 50)) * (5000 - 150));
};
const amountToSlider = (amt: number): number => {
  const c = Math.min(5000, Math.max(0, amt));
  if (c <= 150) return Math.round((c / 150) * 50);
  return Math.round(50 + ((c - 150) / (5000 - 150)) * (5000 - 50));
};

const compressImage = (file: File, maxWidth = 700, quality = 0.65): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });

const timeAgo = (t?: number) => {
  if (!t) return 'just now';
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

// ---------- Animated counter ----------
function useCountUp(target: number, durationMs = 3000) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;
    if (from === target) return;
    startRef.current = null;
    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}

// ---------- Three cascading goal bars ----------
function GoalBars({ verified, pending }: { verified: number; pending: number }) {
  const animV = useCountUp(verified);
  const animP = useCountUp(pending);

  return (
    <div className="space-y-4 mt-6">
      {GOALS.map((g, i) => {
        const pctV = Math.min(100, (animV / g.amount) * 100);
        const pctT = Math.min(100, ((animV + animP) / g.amount) * 100);
        const reached = verified >= g.amount;
        return (
          <div key={g.amount}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded-md"
                  style={{ background: g.track, color: g.color }}>
                  Goal {i + 1}
                </span>
                <span className="text-sm font-semibold text-stone-700">{g.label}</span>
              </div>
              <div className="text-right">
                <span className="font-black font-mono text-sm" style={{ color: reached ? g.color : undefined }}>
                  {inr(g.amount)}
                </span>
                {reached && <span className="ml-1.5 text-xs font-bold" style={{ color: g.color }}>✓ Reached!</span>}
              </div>
            </div>
            <div className="relative h-3 rounded-full" style={{ background: g.track }}>
              <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 opacity-40"
                style={{ width: `${pctT}%`, background: g.color }} />
              <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{ width: `${pctV}%`, background: g.color }} />
            </div>
            <p className="text-[11px] text-stone-400 mt-0.5">{g.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

// ===================== Main App =====================
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [donations, setDonations] = useState<any[]>([]);
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<'board' | 'admin'>('board');
  const [adminTab, setAdminTab] = useState<'queue' | 'messages'>('queue');
  const [sortBy, setSortBy] = useState<'amount' | 'recent'>('amount');
  const [showDonate, setShowDonate] = useState(false);
  const [donateStep, setDonateStep] = useState<'name' | 'amount'>('name');
  const [preview, setPreview] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null); // entry pending inline delete confirm
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  // ------- Message-to-Pihu modal state -------
  // "celebration" = shown right after a new milestone; "credits" = opened from homescreen button
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgModalMode, setMsgModalMode] = useState<'celebration' | 'credits'>('celebration');
  const [modalHighestLevel, setModalHighestLevel] = useState<typeof USER_LEVELS[0]>(USER_LEVELS[0]);
  const [msgCreditsLeft, setMsgCreditsLeft] = useState(0); // credits remaining in current session
  const [pihuMsg, setPihuMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgSenderName, setMsgSenderName] = useState('');

  // Reactive home-screen credit count (reads localStorage)
  const [homeCredits, setHomeCredits] = useState(() => {
    const n = localStorage.getItem('pihu_donor_name') ?? '';
    return getCredits(n);
  });
  const refreshHomeCredits = useCallback(() => {
    const n = localStorage.getItem('pihu_donor_name') ?? '';
    setHomeCredits(getCredits(n));
  }, []);

  // ------- Donor form -------
  const [name, setName] = useState(() => localStorage.getItem('pihu_donor_name') ?? '');
  const [amount, setAmount] = useState(100);
  const [amountStr, setAmountStr] = useState('100');
  const [sliderRaw, setSliderRaw] = useState(amountToSlider(100));
  const [shot, setShot] = useState('');
  const [shotName, setShotName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');

  const isAdmin = !!user && !user.isAnonymous;

  const notify = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3200);
  };

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
      else signInAnonymously(auth).catch(console.error);
    });
  }, []);

  // Public leaderboard
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      donationsCol(),
      (snap) => { setDonations(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
  }, [user]);

  // Proofs — admin only
  useEffect(() => {
    if (!isAdmin) { setProofs({}); return; }
    return onSnapshot(proofsCol(), (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => (map[d.id] = (d.data() as any).image));
      setProofs(map);
    });
  }, [isAdmin]);

  // Messages — admin only
  useEffect(() => {
    if (!isAdmin) { setMessages([]); return; }
    return onSnapshot(messagesCol(), (snap) => {
      setMessages(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => b.createdAt - a.createdAt)
      );
    });
  }, [isAdmin]);

  // Stats
  const stats = useMemo(() => {
    let verified = 0, pending = 0;
    donations.forEach((d) => {
      const v = Number(d.amount) || 0;
      if (d.status === 'Verified') verified += v;
      else pending += v;
    });
    return { verified, pending };
  }, [donations]);

  // Cumulative verified totals per donor name
  const cumulativeByName = useMemo(() => {
    const map: Record<string, number> = {};
    donations.forEach((d) => {
      if (d.status === 'Verified')
        map[d.displayName] = (map[d.displayName] ?? 0) + (Number(d.amount) || 0);
    });
    return map;
  }, [donations]);

  // Leaderboard grouped by name
  const leaderboard = useMemo(() => {
    const map: Record<string, { displayName: string; totalAmount: number; verifiedAmount: number; latestAt: number }> = {};
    donations.forEach((d) => {
      if (!map[d.displayName])
        map[d.displayName] = { displayName: d.displayName, totalAmount: 0, verifiedAmount: 0, latestAt: d.createdAt ?? 0 };
      map[d.displayName].totalAmount += Number(d.amount) || 0;
      if (d.status === 'Verified') map[d.displayName].verifiedAmount += Number(d.amount) || 0;
      if ((d.createdAt ?? 0) > map[d.displayName].latestAt) map[d.displayName].latestAt = d.createdAt;
    });
    const arr = Object.values(map);
    return sortBy === 'amount'
      ? arr.sort((a, b) => b.verifiedAmount - a.verifiedAmount || b.totalAmount - a.totalAmount)
      : arr.sort((a, b) => b.latestAt - a.latestAt);
  }, [donations, sortBy]);

  const pendingList = useMemo(() => donations.filter((d) => d.status === 'Pending').sort((a, b) => b.createdAt - a.createdAt), [donations]);
  const verifiedList = useMemo(() => donations.filter((d) => d.status === 'Verified').sort((a, b) => b.createdAt - a.createdAt), [donations]);

  // ---------- Amount / slider ----------
  const handleSliderChange = (raw: number) => {
    setSliderRaw(raw);
    const v = sliderToAmount(raw);
    setAmount(v);
    setAmountStr(String(v));
  };
  const handleAmountInput = (val: string) => {
    setAmountStr(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && val !== '') {
      const c = Math.min(5000, Math.max(0, n));
      setAmount(c);
      setSliderRaw(amountToSlider(c));
    }
  };
  const handleAmountBlur = () => {
    const n = parseInt(amountStr, 10);
    if (isNaN(n) || amountStr === '') {
      setAmount(0); setSliderRaw(0); setAmountStr('');
    } else {
      const c = Math.min(5000, Math.max(0, n));
      setAmount(c); setAmountStr(String(c)); setSliderRaw(amountToSlider(c));
    }
  };

  // ---------- Actions ----------
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setShotName(f.name); setShot(await compressImage(f)); }
    catch { notify('Could not read that image. Try another.', true); }
  };

  const openDonate = useCallback(() => {
    setDonateStep('name'); setShot(''); setShotName(''); setShowDonate(true);
  }, []);

  const proceedToAmount = () => {
    const clean = name.trim();
    if (!clean) return notify('Please enter your name.', true);
    localStorage.setItem('pihu_donor_name', clean);
    refreshHomeCredits();
    setDonateStep('amount');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    const amt = amount;
    if (!user) return;
    if (!clean) return notify('Add a display name.', true);
    if (!amt || amt <= 0 || amt > 5000) return notify('Enter a valid amount (₹1–₹5,000).', true);
    if (!shot) return notify('Attach your payment screenshot.', true);

    // Level BEFORE this donation (based on verified total only)
    const prevVerified = cumulativeByName[clean] ?? 0;
    const prevLevel = getUserLevel(prevVerified);   // always defined (min level 0)

    setSubmitting(true);
    try {
      const ref = await addDoc(donationsCol(), {
        displayName: clean,
        amount: amt,
        status: 'Pending',
        createdAt: Date.now(),
        submittedBy: user.uid,
      });
      await setDoc(proofDoc(ref.id), { image: shot, submittedBy: user.uid, createdAt: Date.now() });
      setShot(''); setShotName(''); setShowDonate(false);

      // Level counting includes this new (pending) amount
      const newTotal = prevVerified + amt;
      const newLevel = getUserLevel(newTotal);
      const levelsGained = newLevel.level - prevLevel.level;

      if (levelsGained > 0) {
        // Award one credit per milestone crossed
        addCredits(clean, levelsGained);
        refreshHomeCredits();
        // Open celebration modal — use the highest newly-unlocked level for the banner
        setMsgSenderName(clean);
        setModalHighestLevel(newLevel);
        setMsgCreditsLeft(getCredits(clean)); // freshly updated
        setMsgModalMode('celebration');
        setPihuMsg('');
        setShowMsgModal(true);
      } else {
        notify(`You're on the board, ${clean}. Pending review! 🐾`);
      }
    } catch (err) {
      console.error(err);
      notify('Submission failed. Try again.', true);
    } finally {
      setSubmitting(false);
    }
  };

  // Open message modal from homescreen button
  const openMsgFromHome = () => {
    const n = localStorage.getItem('pihu_donor_name') ?? '';
    if (!n || getCredits(n) <= 0) return;
    setMsgSenderName(n);
    // Show their current highest level
    const myVerified = cumulativeByName[n] ?? 0;
    setModalHighestLevel(getUserLevel(myVerified));
    setMsgCreditsLeft(getCredits(n));
    setMsgModalMode('credits');
    setPihuMsg('');
    setShowMsgModal(true);
  };

  const sendPihuMessage = async () => {
    if (!pihuMsg.trim()) return;
    setSendingMsg(true);
    try {
      await addDoc(messagesCol(), {
        displayName: msgSenderName,
        message: pihuMsg.trim(),
        levelUnlocked: modalHighestLevel.level,
        levelTitle: modalHighestLevel.title,
        levelIcon: modalHighestLevel.icon,
        createdAt: Date.now(),
      });
      spendCredit(msgSenderName);
      refreshHomeCredits();
      const remaining = getCredits(msgSenderName);

      if (remaining > 0) {
        // More credits — stay in modal, update count, clear text
        setMsgCreditsLeft(remaining);
        setMsgModalMode('credits'); // switch to credits mode (no more celebration banner)
        setPihuMsg('');
        notify(`Message sent! 🐾 You have ${remaining} credit${remaining > 1 ? 's' : ''} left.`);
      } else {
        setShowMsgModal(false);
        notify(`Message sent to Pihu! 🐾`);
      }
    } catch (err: any) {
      console.error('[sendPihuMessage]', err?.code, err?.message);
      notify(`Could not send — ${err?.code ?? 'unknown error'}`, true);
    } finally {
      setSendingMsg(false);
    }
  };

  // Skip: credits stay saved — donor can use them later from homescreen button
  const skipPihuMessage = () => {
    setShowMsgModal(false);
    notify(`Donation submitted! 🐾 Pending review.`);
  };

  const verify = async (d: any) => {
    try {
      await updateDoc(doc(db, ...base, 'pihu_donations', d.id), { status: 'Verified', verifiedAt: Date.now() });
      notify(`Verified ${inr(d.amount)} from ${d.displayName}`);
    } catch (err: any) {
      console.error('[verify]', err?.code, err?.message);
      notify(`Could not verify — ${err?.code ?? 'unknown error'}`, true);
    }
  };
  const revert = async (d: any) => {
    try {
      await updateDoc(doc(db, ...base, 'pihu_donations', d.id), { status: 'Pending' });
      notify('Reverted to pending.');
    } catch (err: any) {
      console.error('[revert]', err?.code, err?.message);
      notify(`Could not revert — ${err?.code ?? 'unknown error'}`, true);
    }
  };
  const remove = (d: any) => {
    // Show inline confirm row instead of window.confirm() (blocked in iframe contexts)
    setConfirmDelete(d);
  };
  const confirmRemove = async () => {
    if (!confirmDelete) return;
    const d = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteDoc(doc(db, ...base, 'pihu_donations', d.id));
      await deleteDoc(proofDoc(d.id));
      if (preview?.id === d.id) setPreview(null);
      notify('Entry removed.');
    } catch (err: any) {
      console.error('[remove]', err?.code, err?.message);
      notify(`Could not delete — ${err?.code ?? 'unknown error'}`, true);
    }
  };
  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setLoginErr('');
    try { await signInWithEmailAndPassword(auth, email, password); setPassword(''); }
    catch { setLoginErr('Wrong email or password.'); }
  };
  const logout = async () => { await signOut(auth); setView('board'); };
  const copyUpi = () => {
    navigator.clipboard?.writeText(UPI_ID);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  // Modal-derived values
  const myPreviousTotal = useMemo(() => {
    if (!name.trim()) return 0;
    return cumulativeByName[name.trim()] ?? 0;
  }, [name, cumulativeByName]);
  const myNewTotal = myPreviousTotal + amount;
  const currentTitle = getTitle(myNewTotal);
  const catEmotion = getCatEmotion(amount);
  const myLevel = getUserLevel(myNewTotal);

  const animatedVerified = useCountUp(stats.verified);

  // ======================== RENDER ========================
  return (
    <div className="min-h-screen bg-[#faf7f2] text-stone-900 antialiased">
      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg ${toast.err ? 'bg-rose-600 text-white' : 'bg-stone-900 text-white'
          }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
        <button onClick={() => setView('board')} className="flex items-center gap-2.5 group text-left">
          <span className="w-9 h-9 rounded-full bg-stone-900 overflow-hidden border border-stone-800 flex items-center justify-center shrink-0 shadow-sm">
            <img
              src="/pihu.jpg"
              alt="Pihu"
              className="w-full h-full object-cover object-[50%_20%] group-hover:scale-105 transition-transform duration-200"
            />
          </span>
          <span className="font-bold tracking-tight">Pihu&apos;s Care Fund</span>
        </button>
        <div className="flex items-center gap-2">
          {/* Message Pihu button — only if credits available */}
          {homeCredits > 0 && (
            <button
              onClick={openMsgFromHome}
              className="relative text-sm font-semibold px-3 py-2 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center gap-1.5 transition"
            >
              <MessageCircleHeart className="w-4 h-4" />
              Message Pihu
              <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-black bg-rose-500 text-white rounded-full flex items-center justify-center">
                {homeCredits}
              </span>
            </button>
          )}
          <button
            onClick={() => setView(view === 'admin' ? 'board' : 'admin')}
            className="relative text-sm text-stone-500 hover:text-stone-900 px-3 py-2 rounded-lg flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            Admin
            {isAdmin && pendingList.length > 0 && (
              <span className="ml-0.5 text-[11px] font-bold bg-amber-400 text-stone-900 rounded-full px-1.5">
                {pendingList.length}
              </span>
            )}
          </button>
          <button
            onClick={openDonate}
            className="bg-stone-900 text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-stone-700 active:scale-95 transition"
          >
            Donate
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 pb-24 space-y-6">
        {view === 'board' ? (
          <>
            {/* Hero + progress */}
            <section className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-widest uppercase text-amber-600">Pihu&apos;s Care Fund · Progress</p>
              <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
                <div className="flex items-end gap-3 flex-wrap">
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
                    {inr(animatedVerified)}
                  </h1>
                  {stats.pending > 0 && (
                    <span className="mb-1.5 flex items-center gap-1 text-stone-400 text-base font-semibold">
                      <span className="text-lg font-black">+</span>
                      <span className="font-mono">{inr(stats.pending)}</span>
                      <span className="text-xs font-medium ml-0.5">(pending)</span>
                    </span>
                  )}
                </div>
                <span className="text-sm text-stone-400">collected</span>
              </div>
              <GoalBars verified={stats.verified} pending={stats.pending} />

              <div className="mt-6 pt-5 border-t border-stone-100 flex flex-col sm:flex-row items-center gap-3">
                <a
                  href="upi://pay?pa=8088256450@fam&pn=DONATE TO PIHU&cu=INR"
                  id="__UPI_BUTTON__"
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 font-bold px-6 py-3.5 rounded-2xl shadow-sm border border-amber-600/20 text-center text-sm sm:text-base tracking-wide transition"
                >
                  PAY BY ANY UPI APP
                </a>
                <button
                  onClick={openDonate}
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold px-6 py-3.5 rounded-2xl text-center text-sm sm:text-base tracking-wide transition"
                >
                  Donate &amp; Join Board
                </button>
              </div>
            </section>

            {/* Donor levels legend */}
            <section className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6">
              <p className="text-xs font-semibold tracking-widest uppercase text-stone-400 mb-3">Donor Levels</p>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {USER_LEVELS.map((lvl) => (
                  <div key={lvl.level} className={`rounded-2xl p-3 border text-left ${lvl.level === 0 ? 'bg-stone-50 border-stone-200 opacity-60' : 'bg-stone-50 border-stone-100'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black tracking-wider text-stone-400">
                        {lvl.level === 0 ? 'START' : `LVL ${lvl.level}`}
                      </span>
                      <span>{lvl.icon}</span>
                    </div>
                    <div className="font-bold mt-1 text-sm">{lvl.level === 0 ? '₹0' : inr(lvl.amount)}</div>
                    <div className="text-xs font-semibold text-stone-700">{lvl.title}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-stone-100 pt-4">
                <p className="text-xs font-semibold tracking-widest uppercase text-stone-400 mb-2">Donor Titles</p>
                <div className="flex flex-wrap gap-2">
                  {TITLES.map((t) => (
                    <span key={t.title} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${t.perks ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-stone-50 border-stone-200 text-stone-600'
                      }`}>
                      {t.icon} {t.title} {t.perks ? '⭐' : ''}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-stone-400 mt-2">
                  ⭐ Pihu&apos;s Family (₹2,000+) get access to Pihu&apos;s exclusive pics &amp; videos!
                </p>
              </div>
            </section>

            {/* Leaderboard */}
            <section className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
              <div className="p-5 sm:px-6 flex items-center justify-between gap-3 border-b border-stone-100">
                <h2 className="font-bold text-lg">Leaderboard</h2>
                <div className="inline-flex bg-stone-100 rounded-full p-1 text-xs font-semibold">
                  {(['amount', 'recent'] as const).map((k) => (
                    <button key={k} onClick={() => setSortBy(k)}
                      className={`px-3 py-1.5 rounded-full transition ${sortBy === k ? 'bg-white shadow text-stone-900' : 'text-stone-500'}`}>
                      {k === 'amount' ? 'Top' : 'Latest'}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <p className="p-10 text-center text-sm text-stone-400">Loading…</p>
              ) : leaderboard.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-4xl mb-2">🐱</div>
                  <p className="font-bold">No donations yet</p>
                  <p className="text-sm text-stone-500 mb-4">Claim the #1 spot.</p>
                  <button onClick={openDonate} className="bg-stone-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full">
                    Be first
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {leaderboard.map((d, i) => {
                    const t = getTitle(d.verifiedAmount);
                    const medal = sortBy === 'amount' ? ['🥇', '🥈', '🥉'][i] : undefined;
                    const lvl = getUserLevel(d.verifiedAmount);
                    return (
                      <li key={d.displayName} className="px-5 sm:px-6 py-4 flex items-center gap-4">
                        <div className="w-8 text-center font-bold text-stone-400 shrink-0">
                          {medal ?? <span className="text-sm">{i + 1}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold truncate">{d.displayName}</div>
                          <div className="text-xs text-stone-500 flex items-center gap-1 flex-wrap">
                            <span>{t.icon} {t.title}</span>
                            {lvl && lvl.level > 0 && (
                              <span className="px-1.5 py-0.5 bg-stone-100 rounded-md font-semibold text-stone-500">
                                LVL {lvl.level} {lvl.icon}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-black font-mono">{inr(d.verifiedAmount)}</div>
                          {d.totalAmount > d.verifiedAmount && (
                            <div className="text-[11px] font-semibold text-stone-400 flex items-center justify-end gap-0.5">
                              <span className="font-black">+</span>{inr(d.totalAmount - d.verifiedAmount)}
                              <Clock className="w-3 h-3 ml-0.5" />
                            </div>
                          )}
                          {d.verifiedAmount > 0 && (
                            <div className="text-[11px] font-semibold text-emerald-600 flex items-center justify-end gap-1">
                              <BadgeCheck className="w-3.5 h-3.5" /> Verified
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : !isAdmin ? (
          /* Admin login */
          <section className="max-w-sm mx-auto bg-white rounded-3xl border border-stone-200 p-7 mt-6">
            <h2 className="text-xl font-bold">Admin login</h2>
            <p className="text-sm text-stone-500 mb-5">Review proofs and verify donations.</p>
            <form onSubmit={login} className="space-y-3">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
                className="w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-900" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
                className="w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-900" />
              {loginErr && <p className="text-xs text-rose-600">{loginErr}</p>}
              <button className="w-full bg-stone-900 text-white font-semibold py-2.5 rounded-xl text-sm">Sign in</button>
            </form>
          </section>
        ) : (
          /* Admin panel */
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Admin</h2>
              <button onClick={logout} className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-1.5">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>

            {/* Tab bar */}
            <div className="inline-flex bg-stone-100 rounded-full p-1 text-xs font-semibold gap-1">
              <button onClick={() => setAdminTab('queue')}
                className={`px-4 py-1.5 rounded-full transition flex items-center gap-1.5 ${adminTab === 'queue' ? 'bg-white shadow text-stone-900' : 'text-stone-500'}`}>
                Review queue
                {pendingList.length > 0 && (
                  <span className="bg-amber-400 text-stone-900 rounded-full px-1.5 text-[10px] font-black">{pendingList.length}</span>
                )}
              </button>
              <button onClick={() => setAdminTab('messages')}
                className={`px-4 py-1.5 rounded-full transition flex items-center gap-1.5 ${adminTab === 'messages' ? 'bg-white shadow text-stone-900' : 'text-stone-500'}`}>
                <MessageCircleHeart className="w-3.5 h-3.5" />
                Messages to Pihu
                {messages.length > 0 && (
                  <span className="bg-rose-400 text-white rounded-full px-1.5 text-[10px] font-black">{messages.length}</span>
                )}
              </button>
            </div>

            {adminTab === 'queue' ? (
              <>
                <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-stone-100 font-bold">Pending ({pendingList.length})</div>
                  {pendingList.length === 0 ? (
                    <p className="p-10 text-center text-sm text-stone-400">All caught up.</p>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {pendingList.map((d) => (
                        <li key={d.id} className="p-5 flex items-center gap-4 flex-wrap">
                          <button onClick={() => setPreview(d)}
                            className="w-14 h-[72px] rounded-xl overflow-hidden bg-stone-100 border border-stone-200 shrink-0">
                            {proofs[d.id]
                              ? <img src={proofs[d.id]} alt="proof" className="w-full h-full object-cover" />
                              : <Eye className="w-4 h-4 m-auto text-stone-400" />}
                          </button>
                          <div className="flex-1 min-w-[140px]">
                            <div className="font-bold">{d.displayName}</div>
                            <div className="font-mono font-black text-amber-600">{inr(d.amount)}</div>
                            <div className="text-xs text-stone-500">{timeAgo(d.createdAt)}</div>
                          </div>
                          {confirmDelete?.id === d.id ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-stone-500 font-medium">Delete?</span>
                              <button onClick={confirmRemove}
                                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                                Yes, delete
                              </button>
                              <button onClick={() => setConfirmDelete(null)}
                                className="text-xs text-stone-500 hover:text-stone-800 underline">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => verify(d)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-full">
                                Verify
                              </button>
                              <button onClick={() => remove(d)}
                                className="bg-rose-50 text-rose-600 text-xs font-bold px-4 py-2 rounded-full hover:bg-rose-100">
                                Reject
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-stone-100 flex justify-between font-bold">
                    <span>Verified ({verifiedList.length})</span>
                    <span className="text-stone-400 text-sm font-semibold">{inr(stats.verified)}</span>
                  </div>
                  <ul className="divide-y divide-stone-100 text-sm">
                    {verifiedList.map((d) => (
                      <li key={d.id} className="px-6 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <button onClick={() => setPreview(d)} className="text-stone-400 hover:text-stone-900">
                            <Eye className="w-4 h-4" />
                          </button>
                          <span className="font-semibold truncate">{d.displayName}</span>
                          <span className="font-mono text-emerald-600 font-bold">{inr(d.amount)}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button onClick={() => revert(d)} className="text-xs text-stone-500 hover:text-amber-600">Un-verify</button>
                          {confirmDelete?.id === d.id ? (
                            <>
                              <span className="text-xs text-stone-500 font-medium">Delete?</span>
                              <button onClick={confirmRemove}
                                className="text-xs font-bold text-rose-600 hover:text-rose-800 underline">Yes</button>
                              <button onClick={() => setConfirmDelete(null)}
                                className="text-xs text-stone-400 hover:text-stone-700 underline">No</button>
                            </>
                          ) : (
                            <button onClick={() => remove(d)} className="text-rose-500 hover:text-rose-700">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              /* Messages DM inbox */
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-100 font-bold flex items-center gap-2">
                  <MessageCircleHeart className="w-4 h-4 text-rose-500" />
                  Messages to Pihu ({messages.length})
                </div>
                {messages.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="text-4xl mb-2">🐾</div>
                    <p className="text-sm text-stone-400">No messages yet. Donors earn one message per milestone.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {messages.map((m: any) => (
                      <li key={m.id} className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-lg shrink-0">
                            {m.levelIcon ?? '🐾'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm">{m.displayName}</span>
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full">
                                LVL {m.levelUnlocked} · {m.levelTitle}
                              </span>
                              <span className="text-[11px] text-stone-400">{timeAgo(m.createdAt)}</span>
                            </div>
                            <p className="mt-1.5 text-sm text-stone-700 bg-stone-50 rounded-2xl rounded-tl-sm px-4 py-2.5 border border-stone-100">
                              {m.message}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* ===== Donate Modal ===== */}
      {showDonate && (
        <div className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[94vh] overflow-y-auto">

            {/* Step 1: Name */}
            {donateStep === 'name' && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">Who&apos;s donating? 🐾</h3>
                  <button onClick={() => setShowDonate(false)} className="text-stone-400 hover:text-stone-900">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="text-center mb-6">
                  <div className="text-6xl mb-2">😿</div>
                  <p className="text-stone-500 text-sm">Pihu is waiting to know your name~</p>
                </div>
                <input
                  autoFocus value={name} maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && proceedToAmount()}
                  placeholder="Your display name (e.g. Wing_B_Legend)"
                  className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-900 mb-4"
                />
                {name.trim() && (
                  <p className="text-xs text-stone-400 mb-4">
                    Welcome back, <b className="text-stone-700">{name.trim()}</b>!
                    {myPreviousTotal > 0 && (
                      <> You&apos;ve donated <b className="text-amber-600">{inr(myPreviousTotal)}</b> so far.</>
                    )}
                  </p>
                )}
                <button onClick={proceedToAmount}
                  className="w-full bg-stone-900 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Step 2: Amount + Screenshot */}
            {donateStep === 'amount' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <button onClick={() => setDonateStep('name')}
                    className="text-stone-400 hover:text-stone-900 text-sm flex items-center gap-1">
                    ← {name.trim()}
                  </button>
                  <h3 className="text-base font-bold">Donate for Pihu</h3>
                  <button onClick={() => setShowDonate(false)} className="text-stone-400 hover:text-stone-900">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* UPI */}
                <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4 mb-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold tracking-wider uppercase text-stone-400">1 · Pay via UPI</div>
                      <div className="font-mono font-bold truncate">{UPI_ID}</div>
                    </div>
                    <button type="button" onClick={copyUpi}
                      className="text-xs font-semibold bg-white border border-stone-200 hover:bg-stone-100 rounded-full px-3 py-1.5 flex items-center gap-1.5 shrink-0 transition">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <a
                    href={`upi://pay?pa=${UPI_ID}&pn=DONATE TO PIHU&cu=INR${amount > 0 ? `&am=${amount}` : ''}`}
                    className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm tracking-wide transition border border-amber-600/20 shadow-sm"
                  >
                    PAY BY ANY UPI APP {amount > 0 ? `(${inr(amount)})` : ''}
                  </a>
                </div>

                <form onSubmit={submit} className="space-y-5">
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-stone-400">2 · Choose amount</div>

                  {/* Cat emotion + editable amount */}
                  <div className="flex items-center gap-4 bg-stone-50 rounded-2xl p-4 border border-stone-100">
                    <div className="text-5xl transition-all duration-300 select-none">{catEmotion.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-3xl font-black font-mono text-stone-400 select-none">₹</span>
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          value={amountStr}
                          onChange={(e) => handleAmountInput(e.target.value.replace(/[^0-9]/g, ''))}
                          onBlur={handleAmountBlur}
                          placeholder="0"
                          className="w-full min-w-0 text-3xl font-black font-mono bg-transparent border-none outline-none focus:outline-none text-stone-900"
                        />
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">{catEmotion.mood}</div>
                    </div>
                  </div>

                  {/* Slider */}
                  <div>
                    <style>{`
                      .pihu-slider{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:9999px;background:#e7e5e4;outline:none;cursor:pointer;}
                      .pihu-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:50%;background:#1c1917;cursor:pointer;border:3px solid white;box-shadow:0 0 0 2px #1c1917;transition:transform 0.1s;}
                      .pihu-slider::-webkit-slider-thumb:hover{transform:scale(1.15);}
                      .pihu-slider::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#1c1917;cursor:pointer;border:3px solid white;box-shadow:0 0 0 2px #1c1917;}
                    `}</style>
                    <input type="range" min={0} max={5000} step={1} value={sliderRaw}
                      onChange={(e) => handleSliderChange(Number(e.target.value))}
                      className="pihu-slider" />
                    <div className="flex justify-between text-[11px] text-stone-400 mt-1">
                      <span>₹0</span><span>₹5,000</span>
                    </div>
                  </div>

                  {/* Per-user milestone progress */}
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest uppercase text-stone-400 mb-2">Your Level Progress</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {USER_LEVELS.map((lvl) => {
                        const reached = myNewTotal >= lvl.amount;
                        const isCurrent = myLevel?.level === lvl.level;
                        return (
                          <div key={lvl.level} className={`flex-1 min-w-[48px] rounded-xl p-2 border text-center transition-all ${reached ? 'bg-amber-50 border-amber-300' : 'bg-stone-50 border-stone-100 opacity-40'
                            } ${isCurrent ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
                            <div className="text-base">{lvl.icon}</div>
                            <div className="text-[9px] font-bold text-stone-400">
                              {lvl.level === 0 ? 'START' : `LVL ${lvl.level}`}
                            </div>
                            <div className="text-[9px] font-semibold text-stone-700 leading-tight">{lvl.title}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Title preview */}
                  <div className={`rounded-2xl p-3 border text-center ${currentTitle.perks ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-100'
                    }`}>
                    <div className="text-2xl mb-0.5">{currentTitle.icon}</div>
                    <div className="font-bold text-sm">{currentTitle.title}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {myPreviousTotal > 0
                        ? <>{inr(myPreviousTotal)} prev + {inr(amount)} now = <b className="text-stone-700">{inr(myNewTotal)}</b></>
                        : <>Based on {amount > 0 ? inr(amount) : '₹0'} donation</>}
                    </div>
                    {currentTitle.perks && (
                      <div className="text-[11px] text-amber-600 font-semibold mt-1">
                        ⭐ Unlocks Pihu&apos;s exclusive pics &amp; videos!
                      </div>
                    )}
                  </div>

                  {/* Screenshot upload */}
                  <div>
                    <div className="text-[11px] font-semibold tracking-wider uppercase text-stone-400 mb-2">3 · Upload screenshot</div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                    {!shot ? (
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="w-full border-2 border-dashed border-stone-300 hover:border-stone-900 rounded-2xl py-6 text-center transition">
                        <Upload className="w-5 h-5 mx-auto mb-1 text-stone-500" />
                        <div className="text-sm font-semibold">Upload payment screenshot</div>
                        <div className="text-xs text-stone-400">Only the admin can see it</div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <img src={shot} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-emerald-800 truncate">{shotName}</div>
                          <div className="text-xs text-emerald-700">Attached ✓</div>
                        </div>
                        <button type="button" onClick={() => { setShot(''); setShotName(''); }}
                          className="text-xs text-stone-500 underline">
                          Change
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-xs font-mono text-stone-500 bg-stone-50 rounded-xl px-3 py-2">
                    {name.trim() || 'Your_Name'} | {inr(amount)} | Status: Pending
                  </div>

                  <button disabled={submitting || amount <= 0}
                    className="w-full bg-stone-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
                    {submitting ? 'Submitting…' : `Submit ${inr(amount)} for Pihu 🐾`}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Message to Pihu Modal ===== */}
      {showMsgModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6">

            {/* Celebration banner — only on first open after a new milestone */}
            {msgModalMode === 'celebration' && (
              <div className="text-center mb-5">
                <div className="text-5xl mb-2 animate-bounce">{modalHighestLevel.icon}</div>
                <h3 className="text-xl font-black">New Milestone Unlocked!</h3>
                <p className="text-sm text-stone-500 mt-1">
                  You&apos;ve reached{' '}
                  <b className="text-amber-600">
                    Level {modalHighestLevel.level} — {modalHighestLevel.title}
                  </b>!
                </p>
              </div>
            )}

            {/* Credits mode header */}
            {msgModalMode === 'credits' && (
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{modalHighestLevel.icon}</span>
                  <div>
                    <h3 className="font-bold text-base">Message Pihu</h3>
                    <p className="text-xs text-stone-500">as {msgSenderName}</p>
                  </div>
                </div>
                <button onClick={() => setShowMsgModal(false)} className="text-stone-400 hover:text-stone-900">
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Credits remaining pill */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center gap-1">
                <MessageCircleHeart className="w-3 h-3" />
                {msgCreditsLeft} message credit{msgCreditsLeft !== 1 ? 's' : ''} remaining
              </span>
              {msgModalMode === 'celebration' && (
                <span className="text-[11px] text-stone-400">Pihu heard about your kindness!</span>
              )}
            </div>

            <div className="space-y-3">
              <textarea
                autoFocus
                value={pihuMsg}
                onChange={(e) => setPihuMsg(e.target.value)}
                maxLength={280}
                rows={3}
                placeholder="Hey Pihu! Hope you enjoy your treats… 🐾"
                className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-900 resize-none"
              />
              <div className="text-[11px] text-stone-400 text-right">{pihuMsg.length}/280</div>

              <button
                onClick={sendPihuMessage}
                disabled={sendingMsg || !pihuMsg.trim()}
                className="w-full bg-stone-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {sendingMsg ? 'Sending…' : 'Send message to Pihu 🐾'}
              </button>

              {/* Skip saves credits for later */}
              <button onClick={skipPihuMessage}
                className="w-full text-stone-400 text-sm py-2 hover:text-stone-700 transition">
                Save for later — use from homescreen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof lightbox (admin only) */}
      {preview && (
        <div onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold">{preview.displayName}</div>
                <div className="text-sm text-stone-500">{inr(preview.amount)} · {preview.status}</div>
              </div>
              <button onClick={() => setPreview(null)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <div className="rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center max-h-[60vh]">
              {isAdmin && proofs[preview.id]
                ? <img src={proofs[preview.id]} alt="proof" className="max-h-[58vh] object-contain" />
                : <p className="p-10 text-sm text-stone-400">No proof available</p>}
            </div>
            {preview.status !== 'Verified' && (
              <button onClick={() => { verify(preview); setPreview(null); }}
                className="w-full bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-sm">
                Verify
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
