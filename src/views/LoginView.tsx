/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  LogIn,
  AlertCircle,
  Sparkles,
  Store,
  Users,
  Mail,
  ArrowRight,
  Download,
  Eye,
  EyeOff,
  Phone,
  MapPin,
  UserPlus,
  Languages,
  KeyRound,
  MessageCircle,
  Copy,
  Check,
  X
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { TajLogo } from '../components/TajLogo';
import { useAppVersion } from '../utils/version';
import { GmailOTPModal } from '../components/GmailOTPModal';
import { PWAInstallGuideModal } from '../components/PWAInstallGuideModal';
import { getStoredAuthorizedEmail } from '../utils/deviceSecurity';
import {
  verifyHumanFormSubmission,
  validateAuthenticEmail,
  validateAuthenticName,
  validateAuthenticPhone,
  validateStrongPassword,
  checkClientSecurityThrottle,
  recordClientAuthOutcome,
  getClientLockoutStatus,
  ClientLockoutStatus,
  sanitizeTextInput
} from '../utils/securityShield';
import { superAdminService } from '../superadmin/superAdminService';
import { PAKISTAN_PROVINCES, getDistrictsForProvince } from '../data/pakistanLocations';

export const LoginView: React.FC = () => {
  const {
    loginWithGoogle,
    resetPasswordWithGoogle,
    loginWithGmail,
    registerNewShop,
    verifyGmailOTP,
    resendGmailOTP,
    cancelOtpVerification,
    isOtpVerificationRequired,
    pendingOtpEmail,
    loginStaff,
    loginDemoStore,
    isAppInstalled,
    installApp,
    authRedirectError,
    setAuthRedirectError
  } = usePOS();
  const { version: appVersion } = useAppVersion();

  // Language Switch State: default is 'en' (English) as requested
  const [lang, setLang] = useState<'en' | 'ur'>(() => {
    try {
      const saved = localStorage.getItem('taj_login_lang');
      return saved === 'ur' ? 'ur' : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('taj_login_lang', lang);
    } catch {}
  }, [lang]);

  // Live Super Admin Global Permissions (Allow New Shop Sign Up & Password Policy)
  const [platformPerms, setPlatformPerms] = useState(
    () => superAdminService.getModuleControlConfig().featurePermissions
  );
  useEffect(() => {
    const refreshPerms = () => {
      setPlatformPerms(superAdminService.getModuleControlConfig().featurePermissions);
    };
    superAdminService.syncModuleControlFromCloud().then(cfg => {
      if (cfg?.featurePermissions) {
        setPlatformPerms(cfg.featurePermissions);
      }
    });
    window.addEventListener('taj_module_control_updated', refreshPerms);
    return () => window.removeEventListener('taj_module_control_updated', refreshPerms);
  }, []);
  const isShopSignupAllowed = platformPerms.allowShopSignup !== false;

  // Temporary flag to hide Google Sign In as requested by user
  const SHOW_GOOGLE_SIGNIN = false;

  // Tab State: 'login' | 'signup' | 'staff_login' | 'demo_store'
  const [activeTab, setActiveTab] = useState<'login' | 'signup' | 'staff_login' | 'demo_store'>('login');
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);

  // Login Form State
  const [gmailInput, setGmailInput] = useState<string>(() => getStoredAuthorizedEmail() || '');
  const [ownerPassword, setOwnerPassword] = useState<string>('');
  const [showOwnerPassword, setShowOwnerPassword] = useState<boolean>(false);
  const [isGmailLoading, setIsGmailLoading] = useState<boolean>(false);

  // Forgot Password Modal State (Google Reset at Top + Helpline 03346800959)
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [forgotAccountInput, setForgotAccountInput] = useState<string>('');
  const [isGoogleResetLoading, setIsGoogleResetLoading] = useState<boolean>(false);
  const [forgotModalError, setForgotModalError] = useState<string>('');
  const [copiedHelpline, setCopiedHelpline] = useState<boolean>(false);

  // Sign Up / New Shop Registration Form State
  const [signupShopName, setSignupShopName] = useState<string>('');
  const [signupOwnerName, setSignupOwnerName] = useState<string>('');
  const [signupEmail, setSignupEmail] = useState<string>('');
  const [signupPassword, setSignupPassword] = useState<string>('');
  const [showSignupPassword, setShowSignupPassword] = useState<boolean>(false);
  const [signupPhone, setSignupPhone] = useState<string>('');
  const [signupProvince, setSignupProvince] = useState<string>('');
  const [signupDistrict, setSignupDistrict] = useState<string>('');
  const [signupCity, setSignupCity] = useState<string>('');
  const [signupAddress, setSignupAddress] = useState<string>('');
  const [isSignupLoading, setIsSignupLoading] = useState<boolean>(false);
  type SignupRequiredField = 'shopName' | 'ownerName' | 'email' | 'password' | 'province' | 'district' | 'phone';
  const [signupFieldErrors, setSignupFieldErrors] = useState<Partial<Record<SignupRequiredField, string>>>({});
  const signupFieldRefs = React.useRef<Record<SignupRequiredField, HTMLInputElement | HTMLSelectElement | null>>({
    shopName: null,
    ownerName: null,
    email: null,
    password: null,
    province: null,
    district: null,
    phone: null
  });
  const clearSignupFieldError = (field: SignupRequiredField) => {
    setSignupFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // Staff Form State
  const [staffUsername, setStaffUsername] = useState<string>('');
  const [staffPassword, setStaffPassword] = useState<string>('');
  const [showStaffPassword, setShowStaffPassword] = useState<boolean>(false);
  const [isStaffLoading, setIsStaffLoading] = useState<boolean>(false);

  // Google Loading & Error
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('taj_pos_google_redirecting') === 'true';
    } catch {
      return false;
    }
  });
  const [error, setError] = useState<string>('');
  // Layer 1 & 2: Invisible Honeypot Trap & Human Interaction Timing Guard
  const [honeypotTrap, setHoneypotTrap] = useState<string>('');
  const formOpenedAtRef = React.useRef<number>(Date.now());
  const hasInteractedRef = React.useRef<boolean>(false);

  // Layer 6: Live Progressive Lockout Countdown Timer (4 fails -> 1m, then every 3 -> 5m, 15m, 30m, 3h, 24h)
  const activeLockScope =
    activeTab === 'staff_login'
      ? 'staff_login'
      : activeTab === 'signup'
      ? 'shop_signup'
      : 'owner_login';
  const activeLockIdentifier =
    activeTab === 'staff_login'
      ? staffUsername.trim()
      : activeTab === 'signup'
      ? signupEmail.trim().toLowerCase()
      : gmailInput.trim().toLowerCase();

  const [lockoutStatus, setLockoutStatus] = useState<ClientLockoutStatus>(() =>
    getClientLockoutStatus('owner_login', getStoredAuthorizedEmail() || '')
  );

  useEffect(() => {
    setLockoutStatus(getClientLockoutStatus(activeLockScope, activeLockIdentifier));
  }, [activeLockScope, activeLockIdentifier]);

  useEffect(() => {
    if (!lockoutStatus.locked) return;
    const interval = window.setInterval(() => {
      const next = getClientLockoutStatus(activeLockScope, activeLockIdentifier);
      setLockoutStatus(next);
      if (!next.locked) {
        setError(prev =>
          prev.includes('Lockout') || prev.includes('سیکیورٹی شیلڈ لاک') ? '' : prev
        );
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [lockoutStatus.locked, activeLockScope, activeLockIdentifier]);

  useEffect(() => {
    formOpenedAtRef.current = Date.now();
  }, [activeTab]);

  const activeError = lockoutStatus.locked && activeTab !== 'demo_store' ? '' : (error || authRedirectError || '');

  const handleGoogleSignIn = async () => {
    setError('');
    if (setAuthRedirectError) setAuthRedirectError(null);
    setIsGoogleLoading(true);

    let safetyTimer: any = null;

    try {
      const result = await loginWithGoogle();
      if (result?.redirecting) {
        safetyTimer = setTimeout(() => {
          setIsGoogleLoading(false);
          try { sessionStorage.removeItem('taj_pos_google_redirecting'); } catch {}
        }, 12000);
        return;
      }
      if (!result.success) {
        setError(result.error || (lang === 'en' ? 'Google sign in failed. Please try again.' : 'گوگل سائن ان میں مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔'));
      }
    } catch (e: any) {
      setError(e?.message || (lang === 'en' ? 'Google sign in encountered an error.' : 'گوگل سائن ان میں خرابی پیش آئی۔'));
    } finally {
      if (!sessionStorage.getItem('taj_pos_google_redirecting')) {
        setIsGoogleLoading(false);
        if (safetyTimer) clearTimeout(safetyTimer);
      }
    }
  };

  const handleGooglePasswordReset = async () => {
    setForgotModalError('');
    setError('');
    if (setAuthRedirectError) setAuthRedirectError(null);
    setIsGoogleResetLoading(true);

    try {
      const targetEmail = forgotAccountInput.trim().includes('@') ? forgotAccountInput.trim() : '';
      const result = await resetPasswordWithGoogle(targetEmail || undefined);
      if (result?.redirecting) {
        return;
      }
      if (!result.success) {
        setForgotModalError(
          result.error ||
            (lang === 'en'
              ? 'Google verification failed. Please select your registered shop Gmail.'
              : 'گوگل تصدیق مکمل نہیں ہو سکی۔ براہِ کرم اپنی دکان والا درست گوگل اکاؤنٹ منتخب کریں۔')
        );
      } else {
        setShowForgotModal(false);
      }
    } catch (e: any) {
      setForgotModalError(
        e?.message ||
          (lang === 'en' ? 'Google verification error.' : 'گوگل تصدیق کے دوران خرابی پیش آئی۔')
      );
    } finally {
      if (!sessionStorage.getItem('taj_pos_google_redirecting')) {
        setIsGoogleResetLoading(false);
      }
    }
  };

  const handleGmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const humanCheck = verifyHumanFormSubmission({
      honeypotValue: honeypotTrap,
      formOpenedAt: formOpenedAtRef.current,
      hasInteracted: hasInteractedRef.current,
      minElapsedMs: 600
    });
    if (!humanCheck.valid) {
      setError(lang === 'en' ? humanCheck.errorEn! : humanCheck.errorUr!);
      return;
    }

    const cleanEmail = gmailInput.trim().toLowerCase();
    const emailCheck = validateAuthenticEmail(cleanEmail);
    if (!emailCheck.valid) {
      setError(lang === 'en' ? emailCheck.errorEn! : emailCheck.errorUr!);
      return;
    }
    const cleanPass = ownerPassword.trim();
    if (!cleanPass) {
      setError(lang === 'en' ? 'Please enter the shop password.' : 'برائے مہربانی دکان کا پاس ورڈ درج کریں۔');
      return;
    }

    const throttleCheck = checkClientSecurityThrottle('owner_login', cleanEmail);
    if (!throttleCheck.valid) {
      setLockoutStatus(getClientLockoutStatus('owner_login', cleanEmail));
      setError(lang === 'en' ? throttleCheck.errorEn! : throttleCheck.errorUr!);
      return;
    }

    setIsGmailLoading(true);
    const result = await loginWithGmail(cleanEmail, undefined, true, false, cleanPass);
    setIsGmailLoading(false);

    if (!result.success) {
      const nextLock = recordClientAuthOutcome('owner_login', cleanEmail, false);
      setLockoutStatus(nextLock);
      if (nextLock.locked) {
        setError('');
      } else {
        setError(result.error || (lang === 'en' ? 'Login failed. Please check your email and password.' : 'لاگ ان کرنے میں مسئلہ پیش آیا۔ ای میل اور پاس ورڈ چیک کریں۔'));
      }
    } else {
      const cleared = recordClientAuthOutcome('owner_login', cleanEmail, true);
      setLockoutStatus(cleared);
      try {
        localStorage.setItem('taj_pos_saved_login_email', cleanEmail);
      } catch {}
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = signupEmail.trim().toLowerCase();
    const cleanShop = sanitizeTextInput(signupShopName, 80);
    const cleanOwner = sanitizeTextInput(signupOwnerName, 80);
    const cleanPass = signupPassword.trim();
    const cleanPhone = sanitizeTextInput(signupPhone, 25);
    const cleanProvince = sanitizeTextInput(signupProvince, 60);
    const cleanDistrict = sanitizeTextInput(signupDistrict, 60);
    const cleanCity = sanitizeTextInput(signupCity, 60);
    const cleanAddress = sanitizeTextInput(signupAddress, 140);

    // Super Admin Global Lock Check: Allow New Shop Sign Up
    const livePerms = superAdminService.getModuleControlConfig().featurePermissions;
    if (livePerms.allowShopSignup === false && !superAdminService.isMasterAdminEmail(cleanEmail)) {
      setError('New shop registration is currently locked by Super Admin.');
      return;
    }

    // Validate ALL required signup fields together so every missing/invalid required box is highlighted in English
    const nextFieldErrors: Partial<Record<SignupRequiredField, string>> = {};

    if (!cleanShop) {
      nextFieldErrors.shopName = 'Shop Name is required.';
    } else {
      const shopCheck = validateAuthenticName(cleanShop, 'Shop Name', 'دکان کا نام');
      if (!shopCheck.valid) {
        nextFieldErrors.shopName = shopCheck.errorEn || 'Please enter a valid Shop Name.';
      }
    }

    if (!cleanOwner) {
      nextFieldErrors.ownerName = 'Owner Name is required.';
    } else {
      const ownerCheck = validateAuthenticName(cleanOwner, 'Owner Name', 'دکاندار کا نام');
      if (!ownerCheck.valid) {
        nextFieldErrors.ownerName = ownerCheck.errorEn || 'Please enter a valid Owner Name.';
      }
    }

    if (!cleanEmail) {
      nextFieldErrors.email = 'Owner Email Address is required.';
    } else {
      const emailCheck = validateAuthenticEmail(cleanEmail);
      if (!emailCheck.valid) {
        nextFieldErrors.email = emailCheck.errorEn || 'Please enter a valid email address.';
      }
    }

    if (!cleanPass) {
      nextFieldErrors.password = 'Account Password is required.';
    } else if (livePerms.requireStrongPasswords !== false) {
      const passCheck = validateStrongPassword(cleanPass, cleanEmail, cleanOwner);
      if (!passCheck.valid) {
        nextFieldErrors.password = passCheck.errorEn || 'Password must be at least 8 characters with letters and numbers.';
      }
    } else if (cleanPass.length < 4) {
      nextFieldErrors.password = 'Password must be at least 4 characters.';
    }

    if (!cleanProvince) {
      nextFieldErrors.province = 'Province is required.';
    }

    if (!cleanDistrict) {
      nextFieldErrors.district = !cleanProvince
        ? 'Select Province first, then choose District.'
        : 'District is required.';
    }

    const phoneCheck = validateAuthenticPhone(cleanPhone, { required: true });
    if (!phoneCheck.valid) {
      nextFieldErrors.phone = phoneCheck.errorEn || 'WhatsApp Number is required.';
    }

    const fieldOrder: SignupRequiredField[] = [
      'shopName',
      'ownerName',
      'email',
      'password',
      'province',
      'district',
      'phone'
    ];
    const firstInvalidField = fieldOrder.find(f => Boolean(nextFieldErrors[f]));
    if (firstInvalidField) {
      setSignupFieldErrors(nextFieldErrors);
      setError('Please fill in all highlighted required (*) fields to complete registration.');
      const targetEl = signupFieldRefs.current[firstInvalidField];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!targetEl.disabled) {
          targetEl.focus();
        }
      }
      return;
    }

    setSignupFieldErrors({});

    // Layer 1 & 2: Honeypot + Human Timing Check
    const humanCheck = verifyHumanFormSubmission({
      honeypotValue: honeypotTrap,
      formOpenedAt: formOpenedAtRef.current,
      hasInteracted: hasInteractedRef.current,
      minElapsedMs: 1200
    });
    if (!humanCheck.valid) {
      setError(humanCheck.errorEn || 'Please wait a moment and submit again.');
      return;
    }

    // Layer 6: Signup Flood Throttle
    const throttleCheck = checkClientSecurityThrottle('shop_signup', cleanEmail);
    if (!throttleCheck.valid) {
      setLockoutStatus(getClientLockoutStatus('shop_signup', cleanEmail));
      setError(throttleCheck.errorEn || 'Too many attempts. Please wait before trying again.');
      return;
    }

    setIsSignupLoading(true);
    const result = await registerNewShop({
      shopName: cleanShop,
      ownerName: cleanOwner,
      email: cleanEmail,
      password: cleanPass,
      phone: cleanPhone,
      province: cleanProvince,
      district: cleanDistrict,
      city: cleanCity,
      address: cleanAddress
    });
    setIsSignupLoading(false);

    if (!result.success) {
      const nextLock = recordClientAuthOutcome('shop_signup', cleanEmail, false);
      setLockoutStatus(nextLock);
      if (nextLock.locked) {
        setError('');
      } else {
        setError(result.error || 'Failed to register shop. Please try again.');
      }
    } else {
      const cleared = recordClientAuthOutcome('shop_signup', cleanEmail, true);
      setLockoutStatus(cleared);
      try {
        localStorage.setItem('taj_pos_saved_login_email', cleanEmail);
      } catch {}
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const humanCheck = verifyHumanFormSubmission({
      honeypotValue: honeypotTrap,
      formOpenedAt: formOpenedAtRef.current,
      hasInteracted: hasInteractedRef.current,
      minElapsedMs: 600
    });
    if (!humanCheck.valid) {
      setError(lang === 'en' ? humanCheck.errorEn! : humanCheck.errorUr!);
      return;
    }

    const cleanUser = sanitizeTextInput(staffUsername, 60);
    const cleanPass = staffPassword.trim();
    if (!cleanUser || !cleanPass) {
      setError(lang === 'en' ? 'Please provide both username and password.' : 'برائے مہربانی یوزر نیم اور پاس ورڈ دونوں درج کریں۔');
      return;
    }
    if (cleanPass.length < 6) {
      setError(lang === 'en' ? 'Password must be at least 6 characters.' : 'پاس ورڈ کم از کم 6 ہندسوں کا ہونا ضروری ہے۔');
      return;
    }

    const throttleCheck = checkClientSecurityThrottle('staff_login', cleanUser);
    if (!throttleCheck.valid) {
      setLockoutStatus(getClientLockoutStatus('staff_login', cleanUser));
      setError(lang === 'en' ? throttleCheck.errorEn! : throttleCheck.errorUr!);
      return;
    }

    setIsStaffLoading(true);
    const result = await loginStaff(cleanUser, cleanPass);
    setIsStaffLoading(false);
    if (!result.success) {
      const nextLock = recordClientAuthOutcome('staff_login', cleanUser, false);
      setLockoutStatus(nextLock);
      if (nextLock.locked) {
        setError('');
      } else {
        setError(result.error || (lang === 'en' ? 'Invalid credentials. Contact the shop owner for details.' : 'درج کردہ تفصیلات غلط ہیں۔ دکان کے مالک سے درست تفصیلات حاصل کریں۔'));
      }
    } else {
      const cleared = recordClientAuthOutcome('staff_login', cleanUser, true);
      setLockoutStatus(cleared);
    }
  };

  const isUrdu = lang === 'ur';

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-3 sm:p-4 selection:bg-blue-600 selection:text-white">
      {/* 1st Time Sign Up Gmail OTP Verification Modal (if ever triggered) */}
      {isOtpVerificationRequired && pendingOtpEmail && (
        <GmailOTPModal
          email={pendingOtpEmail}
          onVerify={(code) => verifyGmailOTP(pendingOtpEmail, code)}
          onResend={resendGmailOTP}
          onCancel={cancelOtpVerification}
        />
      )}

      <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-200/80 w-full max-w-lg text-center relative overflow-hidden">
        {/* Top Gradient Banner */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-600 via-amber-500 to-emerald-600" />

        {/* Top Header Row with Language Switcher */}
        <div className="flex items-center justify-between mb-3 pt-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold">
            <Languages className="w-4 h-4 text-slate-500" />
            <span className="hidden xs:inline">{isUrdu ? 'زبان منتخب کریں:' : 'Language:'}</span>
          </div>

          {/* Language Toggle: English (Default) | اردو */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setLang('en');
                setError('');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                lang === 'en'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🇬🇧</span>
              <span>English</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLang('ur');
                setError('');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                lang === 'ur'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🇵🇰</span>
              <span>اردو</span>
            </button>
          </div>
        </div>

        {/* Taj Logo Emblem */}
        <div className="flex justify-center mb-2">
          <TajLogo size="lg" />
        </div>

        <h2 className="text-2xl font-black text-[#2c3e50] tracking-tight flex items-center justify-center gap-1.5">
          <span>NH POS Shop</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-600 text-white rounded font-mono font-bold">
            {appVersion}
          </span>
        </h2>
        <p className="text-xs text-[#95a5a6] font-medium mt-0.5">
          {isUrdu ? 'کلاؤڈ ریٹیل اور پوائنٹ آف سیل سسٹم' : 'Multi-User Cloud POS & Retail SaaS'}
        </p>

        {/* PWA Direct Install Button */}
        {!isAppInstalled && (
          <div className="mt-2.5 flex justify-center">
            <button
              type="button"
              onClick={async () => {
                const ok = await installApp();
                if (!ok) {
                  setShowInstallGuide(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
              <span>{isUrdu ? '📱 فون میں ایپ انسٹال کریں' : '📱 Install App on Device'}</span>
            </button>
          </div>
        )}

        {/* 3 Smart Navigation Buttons: 1. Admin Login | 2. Staff Login | 3. Demo */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
          {/* Button 1: Admin Login (Includes smart Sign In & Sign Up) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setError('');
            }}
            className={`py-2.5 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeTab === 'login' || activeTab === 'signup'
                ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 font-extrabold">
              <LogIn className="w-4 h-4 text-blue-600" />
              <span>{isUrdu ? 'ایڈمن لاگ ان' : 'Admin Login'}</span>
            </div>
            <span className="text-[9px] font-medium text-slate-500">
              {isUrdu ? 'مالک / نئی دکان' : 'Owner & Sign Up'}
            </span>
          </button>

          {/* Button 2: Staff Login */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('staff_login');
              setError('');
            }}
            className={`py-2.5 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeTab === 'staff_login'
                ? 'bg-white text-purple-700 shadow-sm border border-purple-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 font-extrabold">
              <Users className="w-4 h-4 text-purple-600" />
              <span>{isUrdu ? 'اسٹاف لاگ ان' : 'Staff Login'}</span>
            </div>
            <span className="text-[9px] font-medium text-slate-500">
              {isUrdu ? 'اسٹاف ID' : 'Staff ID (NH-)'}
            </span>
          </button>

          {/* Button 3: Demo */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('demo_store');
              setError('');
            }}
            className={`py-2.5 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeTab === 'demo_store'
                ? 'bg-white text-amber-800 shadow-sm border border-amber-300'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 text-amber-700 font-extrabold">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{isUrdu ? 'ڈیمو' : 'Demo'}</span>
            </div>
            <span className="text-[9px] font-medium text-amber-700">
              {isUrdu ? 'ٹیسٹ POS' : 'Live Test'}
            </span>
          </button>
        </div>

        {/* Live Progressive Wrong-Password Countdown Lockout Banner */}
        {lockoutStatus.locked && activeTab !== 'demo_store' ? (
          <div className="mt-3.5 p-3.5 bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 text-rose-800 border-2 border-rose-300 rounded-2xl text-xs font-bold text-left flex items-center gap-3 animate-in fade-in shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-xl shrink-0 animate-pulse">
              ⏳
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-rose-900">
                  {isUrdu ? 'سیکیورٹی شیلڈ لاک (انتظار کریں)' : 'Security Shield Lockout'}
                </span>
                <span className="px-2 py-0.5 bg-rose-600 text-white rounded-lg font-mono text-xs font-black tracking-tight shadow-xs whitespace-nowrap">
                  ⏳ {lockoutStatus.formattedCountdown}
                </span>
              </div>
              <p className="text-[11px] text-rose-700 mt-1 leading-snug">
                {isUrdu
                  ? `مسلسل ${lockoutStatus.failures} غلط کوششوں کی وجہ سے لاگ ان عارضی طور پر بند ہے۔ براہِ کرم ٹائمر ختم ہونے کا انتظار کریں۔`
                  : `Too many wrong password attempts (${lockoutStatus.failures}). Please wait for the countdown timer to finish before trying again.`}
              </p>
            </div>
          </div>
        ) : activeError ? (
          <div className="mt-3.5 p-3 bg-rose-50 text-rose-700 border-2 border-rose-300 rounded-2xl text-xs font-bold text-left flex items-start gap-2.5 animate-in fade-in shadow-xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <span className="leading-relaxed block">{activeError}</span>
              {(activeError.includes('already') || activeError.includes('رجسٹرڈ') || activeError.includes('registered')) && activeTab === 'signup' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    if (signupEmail) setGmailInput(signupEmail.trim().toLowerCase());
                    setError('');
                  }}
                  className="mt-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{isUrdu ? '🔑 لاگ ان اسکرین پر جائیں (Go to Sign In)' : '🔑 Go to Sign In Screen'}</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* PORTION 1: OWNER EMAIL & PASSWORD LOGIN                  */}
        {/* ======================================================== */}
        {activeTab === 'login' && (
          <div className={`mt-5 space-y-4 ${isUrdu ? 'text-right' : 'text-left'}`}>
            {/* Google Sign In Button (Temporarily hidden per request, code preserved) */}
            {SHOW_GOOGLE_SIGNIN && (
              <div>
                <button
                  type="button"
                  disabled={isGoogleLoading || isGmailLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 border-2 border-slate-300 hover:border-blue-500 rounded-2xl font-black text-slate-800 text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-3 transition-all active:scale-98 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {isGoogleLoading ? (
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  )}
                  <span>{isGoogleLoading ? (isUrdu ? 'گوگل سے تصدیق ہو رہی ہے...' : 'Connecting...') : 'Sign in with Google'}</span>
                </button>
              </div>
            )}

            {/* Direct Email & Password Login Form */}
            <form
              onSubmit={handleGmailSubmit}
              onInput={() => { hasInteractedRef.current = true; }}
              className="space-y-3.5"
            >
              {/* Invisible Anti-Bot Honeypot Trap */}
              <input
                type="text"
                name="website_url"
                value={honeypotTrap}
                onChange={e => setHoneypotTrap(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isUrdu ? 'دکان کے مالک کا ای میل ایڈریس (Email)' : 'Admin / Owner Email Address'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={gmailInput}
                    onChange={e => {
                      hasInteractedRef.current = true;
                      setGmailInput(e.target.value);
                      setError('');
                    }}
                    placeholder={isUrdu ? 'مثلاً: nhposshop@gmail.com' : 'e.g. nhposshop@gmail.com'}
                    required
                    dir="ltr"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all text-sm font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isUrdu ? 'دکان کا پاس ورڈ (Password)' : 'Admin / Shop Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showOwnerPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={ownerPassword}
                    onChange={e => {
                      setOwnerPassword(e.target.value);
                      setError('');
                    }}
                    placeholder={isUrdu ? 'پاس ورڈ درج کریں' : 'Enter password'}
                    required
                    dir="ltr"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all text-sm font-mono text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title={showOwnerPassword ? 'Hide password' : 'Show password'}
                  >
                    {showOwnerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className={`flex ${isUrdu ? 'justify-start' : 'justify-end'} mt-1.5`}>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotAccountInput(gmailInput.trim());
                      setForgotModalError('');
                      setShowForgotModal(true);
                    }}
                    className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>{isUrdu ? 'پاس ورڈ بھول گئے؟' : 'Forgot Password?'}</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isGmailLoading || lockoutStatus.locked || !gmailInput.trim() || !ownerPassword.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-md shadow-blue-600/25 text-sm flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>
                  {lockoutStatus.locked
                    ? (isUrdu ? `⏳ انتظار کریں (${lockoutStatus.formattedCountdown})` : `⏳ Wait ${lockoutStatus.formattedCountdown}`)
                    : isGmailLoading
                    ? (isUrdu ? 'داخل ہو رہے ہیں...' : 'Signing in...')
                    : (isUrdu ? 'ایڈمن لاگ ان کریں (Sign In)' : 'Sign In to Shop')}
                </span>
                {!lockoutStatus.locked && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            {/* Create New Shop (Sign Up) Button right below Sign In Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  if (!isShopSignupAllowed) {
                    setError(
                      isUrdu
                        ? '🔒 نئی دکان کی رجسٹریشن (Sign Up) فی الحال سپر ایڈمن کی جانب سے لاک (Locked) ہے۔'
                        : '🔒 New shop registration (Sign Up) is currently locked by Super Admin.'
                    );
                    return;
                  }
                  setActiveTab('signup');
                  setError('');
                }}
                className={`w-full py-3 px-4 border-2 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-xs active:scale-98 cursor-pointer ${
                  isShopSignupAllowed
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-700 border-rose-200 opacity-90'
                }`}
              >
                {isShopSignupAllowed ? (
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Lock className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  {isShopSignupAllowed
                    ? isUrdu
                      ? '✨ نئی دکان بنائیں (Create New Shop / Sign Up)'
                      : '✨ Create New Shop (Sign Up)'
                    : isUrdu
                    ? '🔒 نئی دکان بنانا لاک ہے (Sign Up Locked by Super Admin)'
                    : '🔒 Create New Shop (Locked by Super Admin)'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PORTION 2: SIGN UP / NEW SHOP REGISTRATION (ENGLISH UI)  */}
        {/* ======================================================== */}
        {activeTab === 'signup' && (
          <div className="mt-5 space-y-3.5 animate-in fade-in duration-200 text-left" dir="ltr">
            {!isShopSignupAllowed && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                <span>New shop registration is currently locked by Super Admin.</span>
              </div>
            )}
            <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl">
              <div className="flex items-center gap-1.5 font-black text-emerald-900 text-xs">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>New Shop Registration</span>
              </div>
              <p className="text-[10.5px] text-emerald-700 mt-0.5 leading-relaxed">
                No OTP required! Fill in all required (<span className="text-rose-600 font-black">*</span>) fields below to register &amp; launch your shop instantly.
              </p>
            </div>

            <form
              noValidate
              onSubmit={handleSignupSubmit}
              onInput={() => { hasInteractedRef.current = true; }}
              className="space-y-3 text-xs"
            >
              {/* Invisible Anti-Bot Honeypot Trap */}
              <input
                type="text"
                name="company_fax"
                value={honeypotTrap}
                onChange={e => setHoneypotTrap(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              {/* 1. Shop Name (Required) */}
              <div>
                <label className={`block font-bold mb-1 ${signupFieldErrors.shopName ? 'text-rose-700' : 'text-slate-700'}`}>
                  Shop Name <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Store className={`w-4 h-4 absolute left-3.5 top-3 ${signupFieldErrors.shopName ? 'text-rose-500' : 'text-slate-400'}`} />
                  <input
                    ref={el => { signupFieldRefs.current.shopName = el; }}
                    type="text"
                    required
                    value={signupShopName}
                    onChange={e => {
                      setSignupShopName(e.target.value);
                      clearSignupFieldError('shopName');
                      setError('');
                    }}
                    placeholder="e.g. Taj Mobile Shop"
                    className={`w-full pl-10 pr-3 py-2 rounded-xl font-bold text-slate-900 focus:outline-none text-sm transition-all ${
                      signupFieldErrors.shopName
                        ? 'bg-rose-50/70 border-2 border-rose-500 ring-2 ring-rose-200 focus:border-rose-600'
                        : 'bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white'
                    }`}
                  />
                </div>
                {signupFieldErrors.shopName && (
                  <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{signupFieldErrors.shopName}</span>
                  </p>
                )}
              </div>

              {/* 2. Owner Name (Required) */}
              <div>
                <label className={`block font-bold mb-1 ${signupFieldErrors.ownerName ? 'text-rose-700' : 'text-slate-700'}`}>
                  Owner Name <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <User className={`w-4 h-4 absolute left-3.5 top-3 ${signupFieldErrors.ownerName ? 'text-rose-500' : 'text-slate-400'}`} />
                  <input
                    ref={el => { signupFieldRefs.current.ownerName = el; }}
                    type="text"
                    required
                    value={signupOwnerName}
                    onChange={e => {
                      setSignupOwnerName(e.target.value);
                      clearSignupFieldError('ownerName');
                      setError('');
                    }}
                    placeholder="e.g. Ali Imtiaz"
                    className={`w-full pl-10 pr-3 py-2 rounded-xl font-bold text-slate-900 focus:outline-none text-sm transition-all ${
                      signupFieldErrors.ownerName
                        ? 'bg-rose-50/70 border-2 border-rose-500 ring-2 ring-rose-200 focus:border-rose-600'
                        : 'bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white'
                    }`}
                  />
                </div>
                {signupFieldErrors.ownerName && (
                  <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{signupFieldErrors.ownerName}</span>
                  </p>
                )}
              </div>

              {/* 3. Owner Email Address (Required) */}
              <div>
                <label className={`block font-bold mb-1 ${signupFieldErrors.email ? 'text-rose-700' : 'text-slate-700'}`}>
                  Owner Email Address <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Mail className={`w-4 h-4 absolute left-3.5 top-3 ${signupFieldErrors.email ? 'text-rose-500' : 'text-slate-400'}`} />
                  <input
                    ref={el => { signupFieldRefs.current.email = el; }}
                    type="email"
                    required
                    value={signupEmail}
                    onChange={e => {
                      setSignupEmail(e.target.value);
                      clearSignupFieldError('email');
                      setError('');
                    }}
                    placeholder="e.g. nhposshop@gmail.com"
                    dir="ltr"
                    className={`w-full pl-10 pr-3 py-2 rounded-xl font-bold text-slate-900 focus:outline-none text-sm font-mono transition-all ${
                      signupFieldErrors.email
                        ? 'bg-rose-50/70 border-2 border-rose-500 ring-2 ring-rose-200 focus:border-rose-600'
                        : 'bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white'
                    }`}
                  />
                </div>
                {signupFieldErrors.email && (
                  <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{signupFieldErrors.email}</span>
                  </p>
                )}
              </div>

              {/* 4. Account Password (Required) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block font-bold ${signupFieldErrors.password ? 'text-rose-700' : 'text-slate-700'}`}>
                    Account Password <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Min 8 chars (A-Z + 0-9)
                  </span>
                </div>
                <div className="relative">
                  <Lock className={`w-4 h-4 absolute left-3.5 top-3 ${signupFieldErrors.password ? 'text-rose-500' : 'text-slate-400'}`} />
                  <input
                    ref={el => { signupFieldRefs.current.password = el; }}
                    type={showSignupPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={signupPassword}
                    onChange={e => {
                      hasInteractedRef.current = true;
                      setSignupPassword(e.target.value);
                      clearSignupFieldError('password');
                      setError('');
                    }}
                    placeholder="Strong password (e.g. Shop@2026)"
                    dir="ltr"
                    className={`w-full pl-10 pr-10 py-2 rounded-xl font-bold text-slate-900 focus:outline-none text-sm font-mono transition-all ${
                      signupFieldErrors.password
                        ? 'bg-rose-50/70 border-2 border-rose-500 ring-2 ring-rose-200 focus:border-rose-600'
                        : 'bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title={showSignupPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {signupFieldErrors.password && (
                  <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{signupFieldErrors.password}</span>
                  </p>
                )}
              </div>

              {/* 5 & 6. Location: Province (Required) & District (Required) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={`block font-bold mb-1 ${signupFieldErrors.province ? 'text-rose-700' : 'text-slate-700'}`}>
                    Province <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className={`w-4 h-4 absolute left-3 top-2.5 pointer-events-none ${signupFieldErrors.province ? 'text-rose-500' : 'text-emerald-600'}`} />
                    <select
                      ref={el => { signupFieldRefs.current.province = el; }}
                      required
                      value={signupProvince}
                      onChange={e => {
                        hasInteractedRef.current = true;
                        setSignupProvince(e.target.value);
                        setSignupDistrict('');
                        clearSignupFieldError('province');
                        clearSignupFieldError('district');
                        setError('');
                      }}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl font-bold text-slate-900 focus:outline-none text-xs sm:text-sm cursor-pointer transition-all ${
                        signupFieldErrors.province
                          ? 'bg-rose-50/70 border-2 border-rose-500 ring-2 ring-rose-200 focus:border-rose-600'
                          : 'bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white'
                      }`}
                    >
                      <option value="">-- Select Province --</option>
                      {PAKISTAN_PROVINCES.map(p => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {signupFieldErrors.province && (
                    <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{signupFieldErrors.province}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className={`block font-bold mb-1 ${signupFieldErrors.district ? 'text-rose-700' : 'text-slate-700'}`}>
                    District <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className={`w-4 h-4 absolute left-3 top-2.5 pointer-events-none ${signupFieldErrors.district ? 'text-rose-500' : 'text-emerald-600'}`} />
                    <select
                      ref={el => { signupFieldRefs.current.district = el; }}
                      required
                      disabled={!signupProvince}
                      value={signupDistrict}
                      onChange={e => {
                        hasInteractedRef.current = true;
                        setSignupDistrict(e.target.value);
                        clearSignupFieldError('district');
                        setError('');
                      }}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl font-bold text-slate-900 focus:outline-none text-xs sm:text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-all ${
                        signupFieldErrors.district
                          ? 'bg-rose-50/70 border-2 border-rose-500 ring-2 ring-rose-200 focus:border-rose-600'
                          : 'bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white'
                      }`}
                    >
                      <option value="">
                        {!signupProvince ? '-- Select Province First --' : '-- Select District --'}
                      </option>
                      {getDistrictsForProvince(signupProvince).map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  {signupFieldErrors.district && (
                    <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{signupFieldErrors.district}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* 7. WhatsApp Number (REQUIRED) & City (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={`block font-bold mb-1 ${signupFieldErrors.phone ? 'text-rose-700' : 'text-slate-700'}`}>
                    WhatsApp Number <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <MessageCircle className={`w-4 h-4 absolute left-3.5 top-3 ${signupFieldErrors.phone ? 'text-rose-500' : 'text-emerald-600'}`} />
                    <input
                      ref={el => { signupFieldRefs.current.phone = el; }}
                      type="tel"
                      required
                      value={signupPhone}
                      onChange={e => {
                        hasInteractedRef.current = true;
                        setSignupPhone(e.target.value);
                        clearSignupFieldError('phone');
                        setError('');
                      }}
                      placeholder="e.g. 0300-1234567"
                      dir="ltr"
                      className={`w-full pl-10 pr-3 py-2 rounded-xl font-bold text-slate-900 focus:outline-none text-sm font-mono transition-all ${
                        signupFieldErrors.phone
                          ? 'bg-rose-50/70 border-2 border-rose-500 ring-2 ring-rose-200 focus:border-rose-600'
                          : 'bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white'
                      }`}
                    />
                  </div>
                  {signupFieldErrors.phone && (
                    <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{signupFieldErrors.phone}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    City / Town <span className="text-slate-400 font-medium">(Optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={signupCity}
                      onChange={e => setSignupCity(e.target.value)}
                      placeholder="e.g. Sadiqabad"
                      className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Shop Address / Bazar <span className="text-slate-400 font-medium">(Optional)</span>
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={signupAddress}
                    onChange={e => setSignupAddress(e.target.value)}
                    placeholder="e.g. Main Bazar, Ghalla Mandi"
                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSignupLoading || lockoutStatus.locked}
                className="w-full mt-2 py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 text-sm flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>
                  {lockoutStatus.locked
                    ? `Wait ${lockoutStatus.formattedCountdown}`
                    : isSignupLoading
                    ? 'Registering Shop...'
                    : 'Register & Launch Shop'}
                </span>
              </button>
            </form>

            {/* Already have an account? Back to Login Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setSignupFieldErrors({});
                  setError('');
                }}
                className="w-full py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border-2 border-blue-200 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-xs active:scale-98 cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-blue-600" />
                <span>← Already have an account? Sign In</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PORTION 3: STAFF LOGIN                                   */}
        {/* ======================================================== */}
        {activeTab === 'staff_login' && (
          <form
            onSubmit={handleStaffSubmit}
            onInput={() => { hasInteractedRef.current = true; }}
            className={`mt-5 space-y-3.5 text-xs ${isUrdu ? 'text-right' : 'text-left'}`}
          >
            {/* Invisible Anti-Bot Honeypot Trap */}
            <input
              type="text"
              name="website_url"
              value={honeypotTrap}
              onChange={e => setHoneypotTrap(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl text-[11px] text-purple-900">
              <span className="font-bold">
                {isUrdu ? '💼 اسٹاف لاگ ان:' : '💼 Staff Member Login:'}
              </span>
              <p className="mt-0.5 text-purple-700">
                {isUrdu
                  ? 'دکان کے مالک کا فراہم کردہ یوزر نیم (NH-...) اور پاس ورڈ درج کریں۔'
                  : 'Enter the staff username (NH-...) and password provided by the shop owner.'}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase">
                  {isUrdu ? 'شناختی آئی ڈی (یوزر نیم)' : 'Staff Username'}
                </label>
                <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-1.5 py-0.2 rounded font-mono">
                  NH- Prefix
                </span>
              </div>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={staffUsername}
                  onChange={e => {
                    setStaffUsername(e.target.value);
                    setError('');
                  }}
                  placeholder={isUrdu ? 'مثلاً: NH-ali01 (یا صرف ali01)' : 'e.g. NH-ali01 (or ali01)'}
                  required
                  dir="ltr"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all text-sm font-mono text-slate-900"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {isUrdu
                  ? '* تمام عملے کا یوزر نیم NH سے شروع ہوتا ہے۔ آپ NH- کے ساتھ یا بغیر بھی لکھ سکتے ہیں۔'
                  : '* All staff usernames start with NH. You may type with or without NH-.'}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                {isUrdu ? 'پاس ورڈ' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type={showStaffPassword ? 'text' : 'password'}
                  value={staffPassword}
                  onChange={e => {
                    setStaffPassword(e.target.value);
                    setError('');
                  }}
                  placeholder={isUrdu ? 'پاس ورڈ درج کریں' : 'Enter staff password'}
                  required
                  minLength={6}
                  dir="ltr"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all text-sm font-mono text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPassword(!showStaffPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title={showStaffPassword ? 'Hide password' : 'Show password'}
                >
                  {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className={`flex ${isUrdu ? 'justify-start' : 'justify-end'} mt-1.5`}>
                <button
                  type="button"
                  onClick={() => {
                    setForgotAccountInput(staffUsername.trim());
                    setForgotModalError('');
                    setShowForgotModal(true);
                  }}
                  className="text-[10px] font-extrabold text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>{isUrdu ? 'پاس ورڈ بھول گئے؟' : 'Forgot Password?'}</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isStaffLoading || lockoutStatus.locked}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 text-sm flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {!lockoutStatus.locked && <LogIn className="w-4 h-4" />}
              <span>
                {lockoutStatus.locked
                  ? (isUrdu ? `⏳ انتظار کریں (${lockoutStatus.formattedCountdown})` : `⏳ Wait ${lockoutStatus.formattedCountdown}`)
                  : isStaffLoading
                  ? (isUrdu ? 'تصدیق ہو رہی ہے...' : 'Checking Credentials...')
                  : (isUrdu ? 'اسٹاف لاگ ان' : 'Staff Login')}
              </span>
            </button>
          </form>
        )}

        {/* ======================================================== */}
        {/* PORTION 4: DEMO STORE                                    */}
        {/* ======================================================== */}
        {activeTab === 'demo_store' && (
          <div className={`mt-5 space-y-4 ${isUrdu ? 'text-right' : 'text-left'}`}>
            <div className="p-4 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-yellow-500/15 border-2 border-dashed border-amber-400 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏪</span>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">
                      {isUrdu ? 'تاج ڈیمو سپر سٹور' : 'Live Demo Store'}
                    </h3>
                    <p className="text-[11px] text-amber-900 font-semibold">
                      {isUrdu ? 'مکمل بھری ہوئی دکان • فوری رسائی بغیر پاسورڈ' : 'Fully loaded store • Instant access with no password'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-950 border border-amber-400/50 shrink-0">
                  {isUrdu ? 'ری سیٹ: ۳۰ منٹ' : 'Auto-Reset 30m'}
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-normal">
                {isUrdu
                  ? 'اگر آپ کو سسٹم سمجھ نہیں آ رہا تو اس ڈیمو اکاؤنٹ میں جا کر دیکھیں۔ تمام کھاتے، کیش بک، ادھار، کسٹمرز اور پی او ایس پہلے سے بھرے ہوئے ہیں۔ آپ نیا ڈیٹا شامل بھی کر سکتے ہیں اور ڈیلیٹ بھی کر سکتے ہیں۔ ہر ۳۰ منٹ بعد یہ خود بخود دوبارہ اصل حالت میں بحال ہو جائے گا۔'
                  : 'Explore all features: daily cash book, POS sales, customer ledger, easyload, and stock. You can add or delete data freely. It will automatically reset to original state every 30 minutes.'}
              </p>

              <button
                type="button"
                onClick={loginDemoStore}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-xl shadow-lg shadow-amber-500/30 text-sm flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-yellow-200" />
                <span>{isUrdu ? 'ڈیمو دکان میں داخل ہوں' : 'Start Live Demo'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Informative Security Card (Always visible at bottom) */}
        <div className={`mt-5 p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-[11px] text-slate-700 ${isUrdu ? 'text-right' : 'text-left'}`}>
          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              {isUrdu ? 'آزاد اور محفوظ کلاؤڈ کھاتہ (100% Private)' : '100% Private & Isolated Cloud Account'}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            {isUrdu
              ? 'ہر دکان کا ڈیٹا کلاؤڈ پر علیحدہ اور محفوظ ہے۔ آپ کسی بھی وقت اپنے ای میل اور پاس ورڈ سے لاگ ان ہو سکتے ہیں۔'
              : 'Each shop data is securely isolated on cloud. You can log in anytime with your registered email and password.'}
          </p>
        </div>

        {/* Footer Text */}
        <div className="mt-5 flex flex-col items-center">
          <div className="text-[10px] text-[#bdc3c7] font-bold tracking-widest uppercase">
            {isUrdu
              ? 'تیار کردہ: محمد وصی • این ایچ پی او ایس شاپ'
              : 'POWERED BY WASI DEVELOPER • NH POS SHOP'}
          </div>
        </div>
      </div>

      {/* Guide Modal for Login View */}
      <PWAInstallGuideModal
        isOpen={showInstallGuide}
        onClose={() => setShowInstallGuide(false)}
        onNativeInstall={installApp}
        canNativeInstall={Boolean((window as any).deferredInstallPrompt)}
      />

      {/* Forgot Password / Reset Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div
            className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150 my-auto ${
              isUrdu && activeTab !== 'staff_login' ? 'text-right' : 'text-left'
            }`}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1b263b] to-slate-800 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 border border-amber-400/40 rounded-xl">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-black text-sm">
                    {activeTab === 'staff_login'
                      ? 'Staff Password Reset'
                      : isUrdu
                      ? 'پاس ورڈ ری سیٹ پیج (Reset Password)'
                      : 'Reset Your Shop Password'}
                  </h3>
                  <p className="text-[10px] text-slate-300 font-semibold">
                    {activeTab === 'staff_login'
                      ? 'Contact your Shop Owner to reset your password'
                      : isUrdu
                      ? 'گوگل (Gmail) سے تصدیق کریں اور فوری نیا پاس ورڈ لگائیں'
                      : 'Verify with Google to set a new password immediately'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
              {activeTab === 'staff_login' ? (
                /* ================================================================= */
                /* STAFF FORGOT PASSWORD VIEW: ONLY SHOP OWNER CONTACT NOTICE        */
                /* ================================================================= */
                <div className="p-5 bg-purple-50 border-2 border-purple-200 rounded-2xl text-purple-950 shadow-xs">
                  <p className="text-base sm:text-lg font-extrabold leading-relaxed text-left">
                    💡 Note: Staff members can also ask their Shop Owner to reset their password from the Staff Management tab.
                  </p>
                </div>
              ) : (
                /* ================================================================= */
                /* ADMIN / OWNER FORGOT PASSWORD VIEW: GOOGLE RESET + HELPLINE       */
                /* ================================================================= */
                <>
                  {/* TOP SECTION: CONTINUE WITH GOOGLE FOR INSTANT PASSWORD RESET */}
                  <div className="p-4 bg-gradient-to-br from-blue-50 via-indigo-50/70 to-emerald-50/60 border-2 border-blue-200 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-wider">
                        <Sparkles className="w-3 h-3 text-yellow-300" />
                        <span>{isUrdu ? 'طریقہ نمبر 1: خودکار ری سیٹ' : 'Instant Self-Reset'}</span>
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700">
                        {isUrdu ? '✓ سب سے تیز اور آسان' : '✓ Fastest Method'}
                      </span>
                    </div>

                    <div className="text-slate-800 leading-relaxed">
                      {isUrdu ? (
                        <p>
                          جس ای میل پر آپ کی دکان بنی ہوئی ہے، نیچے{' '}
                          <span className="font-black text-blue-700">Continue with Google</span> بٹن دبا کر اسی گوگل
                          اکاؤنٹ سے لاگ ان کریں۔ ای میل درست ہوتے ہی آپ کی دکان کھل جائے گی اور{' '}
                          <span className="font-black text-emerald-800">نیا پاس ورڈ لگانے کا پاپ اپ (Popup)</span> سامنے آ
                          جائے گا!
                        </p>
                      ) : (
                        <p>
                          Click <span className="font-black text-blue-700">Continue with Google</span> below and sign in
                          with your registered shop email. If the email matches your shop, you will be logged in and the{' '}
                          <span className="font-black text-emerald-800">New Password Reset Popup</span> will appear
                          immediately!
                        </p>
                      )}
                    </div>

                    {/* Optional Registered Email Input */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {isUrdu
                          ? 'آپ کی دکان کا رجسٹرڈ ای میل (اختیاری)'
                          : 'Your Registered Shop Email (Optional)'}
                      </label>
                      <input
                        type="email"
                        value={forgotAccountInput}
                        onChange={e => {
                          setForgotAccountInput(e.target.value);
                          setForgotModalError('');
                        }}
                        placeholder={isUrdu ? 'مثلاً: nhposshop@gmail.com' : 'e.g. nhposshop@gmail.com'}
                        dir="ltr"
                        className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    {forgotModalError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-[11px] font-bold flex items-start gap-2 animate-in fade-in">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{forgotModalError}</span>
                      </div>
                    )}

                    {/* Continue with Google Button (At the TOP of Reset Page) */}
                    <button
                      type="button"
                      onClick={handleGooglePasswordReset}
                      disabled={isGoogleResetLoading}
                      className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 text-slate-900 border-2 border-blue-600 rounded-xl font-black text-xs shadow-md shadow-blue-600/15 flex items-center justify-center gap-2.5 transition-all active:scale-98 cursor-pointer disabled:opacity-60"
                    >
                      {isGoogleResetLoading ? (
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          />
                        </svg>
                      )}
                      <span>
                        {isGoogleResetLoading
                          ? isUrdu
                            ? 'گوگل اکاؤنٹ چیک ہو رہا ہے...'
                            : 'Verifying Google Account...'
                          : isUrdu
                          ? 'Continue with Google (نیا پاس ورڈ بنائیں)'
                          : 'Continue with Google to Reset Password'}
                      </span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="relative flex items-center justify-center py-0.5">
                    <div className="border-t border-slate-200 w-full" />
                    <span className="bg-white px-3 text-[10px] font-bold text-slate-400 uppercase shrink-0">
                      {isUrdu ? 'یا سپر ایڈمن ہیلپ لائن سے رابطہ کریں' : 'OR CONTACT SUPER ADMIN HELPLINE'}
                    </span>
                    <div className="border-t border-slate-200 w-full" />
                  </div>

                  {/* BOTTOM SECTION: HELPLINE 0334-6800959 BACKUP OPTION */}
                  <div className="p-3 bg-slate-900 text-white rounded-2xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-500/20 rounded-xl">
                        <Phone className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-left" dir="ltr">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Super Admin Helpline / WhatsApp
                        </span>
                        <span className="text-base font-black font-mono tracking-wider text-amber-400">
                          0334-6800959
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('03346800959');
                        setCopiedHelpline(true);
                        setTimeout(() => setCopiedHelpline(false), 2500);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[11px] font-bold flex items-center gap-1.5 text-slate-200 cursor-pointer shrink-0 transition-colors"
                    >
                      {copiedHelpline ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{isUrdu ? 'کاپی ہو گیا' : 'Copied!'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{isUrdu ? 'نمبر کاپی کریں' : 'Copy Number'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Direct Action Buttons (WhatsApp & SMS/Call) */}
                  <div className="space-y-2">
                    <a
                      href={`https://wa.me/923346800959?text=${encodeURIComponent(
                        `السلام علیکم! میں اپنے NH POS Shop اکاؤنٹ کا پاس ورڈ بھول گیا ہوں۔ براہ کرم میرا پاس ورڈ ری سیٹ کر دیں۔\nاکاؤنٹ / ای میل: ${
                          forgotAccountInput.trim() || gmailInput.trim() || '(میرا ای میل)'
                        }`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-xs text-xs flex items-center justify-center gap-2 transition-all active:scale-98"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>
                        {isUrdu
                          ? '💬 واٹس ایپ پر پاس ورڈ ری سیٹ کا میسج بھیجیں'
                          : '💬 Send WhatsApp Message (0334-6800959)'}
                      </span>
                    </a>

                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`sms:03346800959?body=${encodeURIComponent(
                          `NH POS Password Reset Request - Account: ${
                            forgotAccountInput.trim() || gmailInput.trim() || 'My Shop'
                          }`
                        )}`}
                        className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>{isUrdu ? 'ایس ایم ایس (SMS) بھیجیں' : 'Send SMS Message'}</span>
                      </a>

                      <a
                        href="tel:03346800959"
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{isUrdu ? 'فون کال کریں' : 'Call Helpline'}</span>
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-100 px-5 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                {isUrdu && activeTab !== 'staff_login' ? 'بند کریں' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
