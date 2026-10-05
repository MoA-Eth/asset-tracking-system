import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getErrorStatus } from '../api/client';
import { useToast } from '../context/ToastContext';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui';
import { MoaLogo } from '../components/ui/MoaLogo';
import styles from './LoginPage.module.css';

export const LoginPage: React.FC = () => {
  const { login, sessionNotice } = useAuth();
  const toast = useToast();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // Starts with the reason the user was signed out, if any
  const [errorMsg, setErrorMsg] = useState<string | null>(sessionNotice);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) {
      const msg = 'Enter your email or employee ID.';
      setErrorMsg(msg);
      toast.warning('Credentials Required', msg);
      return;
    }
    setErrorMsg(null);
    setSigningIn(true);
    try {
      await login(usernameOrEmail.trim(), password);
      toast.success('Welcome Back', 'Your credentials are verified. Logging in...');
    } catch (err: any) {
      const msg = err.message || 'Authentication failed. Please verify credentials.';
      setErrorMsg(msg);
      // Wrong email or password is the user's to fix; anything else is the system's
      const status = getErrorStatus(err);
      const isCredentialProblem = status !== undefined && status < 500;
      toast.error(isCredentialProblem ? 'Sign-in Failed' : "Can't Sign In Right Now", msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.identity} aria-label="Ministry identity and portal introduction">
          <header className={styles.brand}>
            <MoaLogo className={styles.logo} />
            <div>
              <p className={styles.amharic} lang="am">የግብርና ሚኒስቴር</p>
              <p className={styles.ministry}>Ministry of Agriculture</p>
            </div>
          </header>
          <p className={styles.eyebrow}>MoA–AMS</p>
          <h1 className={styles.title}>Fixed Asset &amp;<br />Store Management</h1>
          <p className={styles.description}>
            One place to manage Ministry assets, inventory, and store operations.
          </p>
          <div className={styles.colours} aria-hidden="true">
            <span /><span /><span />
          </div>
          <p className={styles.country}>Federal Democratic Republic of Ethiopia</p>
        </section>

        <section className={styles.card} aria-labelledby="login-heading">
          <h2 id="login-heading" className={styles.heading}>Sign in</h2>
          <p className={styles.caption}>Enter your Ministry account details to continue.</p>

          {errorMsg && (
            <div className={styles.error} role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-username">
                Email or employee ID
              </label>
              <input
                id="login-username"
                className={styles.input}
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="name@moa.gov.et or 00123456"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">
                Password
              </label>
              <div className={styles.password}>
                <input
                  id="login-password"
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  className={styles.reveal}
                  type="button"
                  aria-controls="login-password"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={signingIn}
              aria-busy={signingIn}
              className={styles.submit}
              rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
            >
              Sign in
            </Button>
          </form>
          <p className={styles.help}>
            <strong>Need access?</strong> Contact your system administrator.
          </p>
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
