import { useEffect, useMemo, useState } from "react";
import { api, type Account, type AdminSettings, type ContextSummary, type Opportunity } from "./api";

const settingLabels: Record<keyof AdminSettings, string> = {
  monitorPortfolioAndWatchlist: "Monitor portfolio and watchlist",
  continuousScan: "Continuously scan for new premium opportunities",
  topOpportunityCount: "Top opportunities count",
  lowPremiumMin: "Low premium threshold",
  mediumPremiumMin: "Medium premium threshold",
  highPremiumMin: "High premium threshold",
  highSignalThreshold: "High signal threshold",
  notifyRiskContextChanges: "Notify on meaningful risk/context changes",
  enableTradeExecution: "Enable trade execution",
  enableDecisionRecommendations: "Enable buy/sell recommendation text",
  enableComplexAIOptimization: "Use complex AI optimization",
  enableBacktesting: "Enable backtesting / historical analytics",
  fullyAutomateStrategyChanges: "Fully automate strategy changes"
};

const numberSettingKeys: Array<keyof AdminSettings> = [
  "topOpportunityCount",
  "lowPremiumMin",
  "mediumPremiumMin",
  "highPremiumMin",
  "highSignalThreshold"
];

const ACCESS_TOKEN_KEY = "trading-copilot-access-token";
const REFRESH_TOKEN_KEY = "trading-copilot-refresh-token";
const EXAMPLE_MCP_URL = "https://agent.robinhood.com/mcp/trading";

function App() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [status, setStatus] = useState("Create account or login.");
  const [principal, setPrincipal] = useState("");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationTarget, setVerificationTarget] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [devVerificationCode, setDevVerificationCode] = useState("");
  const [autoVerifiedOnRegister, setAutoVerifiedOnRegister] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerFeedback, setRegisterFeedback] = useState("Enter email or phone, then click Register.");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState("Enter your email/phone and password, then click Login.");
  const [isConnectingRobinhood, setIsConnectingRobinhood] = useState(false);
  const [connectFeedback, setConnectFeedback] = useState("Click Connect Robinhood to start secure OAuth.");

  const [robinhoodUsername, setRobinhoodUsername] = useState("");
  const [mcpUrl, setMcpUrl] = useState(EXAMPLE_MCP_URL);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; message: string; createdAt: string }>>([]);
  const [positions, setPositions] = useState<Array<{ id: string; symbol: string; strategy: string; pnl: number; pnlPct: number }>>(
    []
  );
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountWatchlist, setNewAccountWatchlist] = useState("AAPL,MSFT,SPY");
  const [contextSummary, setContextSummary] = useState<ContextSummary | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  const saveTokens = (tokens: { accessToken: string; refreshToken: string }): void => {
    api.setTokens(tokens);
    window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  };

  const clearTokens = (): void => {
    api.clearTokens();
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  };

  const loadAccountData = async (accountId: string) => {
    const [settingsData, opportunitiesData, alertsData, positionsData] = await Promise.all([
      api.getSettings(accountId),
      api.getOpportunities(accountId),
      api.getAlerts(accountId),
      api.getPositions(accountId)
    ]);
    setSettings(settingsData);
    setOpportunities(opportunitiesData.opportunities);
    setAlerts(alertsData);
    setPositions(positionsData);
  };

  const initAuthenticatedData = async () => {
    const me = await api.getMe();
    setPrincipal(me.principal);
    setRobinhoodUsername(me.robinhoodUsername ?? "");
    const accountList = await api.getAccounts();
    setAccounts(accountList);
    if (accountList.length > 0) {
      const accountId = accountList[0].id;
      setSelectedAccountId(accountId);
      await loadAccountData(accountId);
    } else {
      setSettings(null);
      setOpportunities([]);
      setAlerts([]);
      setPositions([]);
    }
    setStatus("Ready");
  };

  useEffect(() => {
    const init = async () => {
      const storedAccess = window.localStorage.getItem(ACCESS_TOKEN_KEY);
      const storedRefresh = window.localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedAccess || !storedRefresh) {
        return;
      }
      try {
        api.setTokens({ accessToken: storedAccess, refreshToken: storedRefresh });
        await initAuthenticatedData();
        setIsAuthed(true);
      } catch (_error) {
        clearTokens();
      }
    };
    void init();
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const connectStatus = params.get("rh_connect");
    const connectMessage = params.get("message");
    if (!connectStatus) {
      return;
    }
    const applyCallback = async () => {
      if (connectStatus === "success") {
        try {
          await initAuthenticatedData();
          setConnectFeedback("Robinhood OAuth connection completed.");
          setStatus("Robinhood OAuth connected. MCP credentials saved securely.");
        } catch (error) {
          setConnectFeedback("Robinhood connected, but account refresh failed.");
          setStatus(error instanceof Error ? error.message : "Connected, but failed to refresh account data.");
        }
      } else {
        setConnectFeedback(connectMessage ? `Connection failed: ${connectMessage}` : "Connection failed.");
        setStatus(connectMessage ? `Robinhood connect failed: ${connectMessage}` : "Robinhood connect failed.");
      }
      window.history.replaceState(null, "", window.location.pathname);
    };
    void applyCallback();
  }, [isAuthed]);

  const register = async () => {
    if (!password.trim() || (!email.trim() && !phone.trim())) {
      setStatus("Enter password and at least one contact method (email or phone) before registering.");
      setRegisterFeedback("Registration requires a password and at least one contact method.");
      return;
    }
    setIsRegistering(true);
    setAutoVerifiedOnRegister(false);
    setDevVerificationCode("");
    setRegisterFeedback("Register request sent. Creating your account...");
    setStatus("Creating account and sending verification code...");
    try {
      const registration = await api.register({
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password
      });
      setChallengeId(registration.challengeId);
      setVerificationTarget(registration.target);
      setDeliveryMessage(registration.deliveryMessage);
      setDevVerificationCode(registration.devVerificationCode ?? "");
      setAutoVerifiedOnRegister(registration.autoVerified);
      setIdentifier((email.trim() || phone.trim()).toLowerCase());
      if (registration.autoVerified) {
        setRegisterFeedback(`Success. ${registration.deliveryMessage} Your account is auto-verified in this environment.`);
        setStatus(`Registration complete for ${registration.target}. You can login now.`);
      } else {
        setRegisterFeedback(`Success. ${registration.deliveryMessage}`);
        setStatus(`Verification setup complete for ${registration.target}. Continue to step 2.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed.";
      setRegisterFeedback(message);
      setStatus(message);
    } finally {
      setIsRegistering(false);
    }
  };

  const verify = async () => {
    try {
      await api.verify({ challengeId: challengeId.trim(), code: verificationCode.trim() });
      setStatus("Verification complete. You can now login.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed.");
    }
  };

  const login = async () => {
    if (!identifier.trim() || !password.trim()) {
      const message = "Enter both identifier and password before logging in.";
      setLoginFeedback(message);
      setStatus(message);
      return;
    }
    setIsLoggingIn(true);
    setLoginFeedback("Logging in...");
    setStatus("Authenticating...");
    try {
      const loginResult = await api.login({
        identifier: identifier.trim(),
        password
      });
      saveTokens(loginResult);
      await initAuthenticatedData();
      setIsAuthed(true);
      setLoginFeedback("Login successful.");
      setStatus("Logged in.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      setLoginFeedback(message);
      setStatus(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const updateBrokerConfig = async () => {
    try {
      await api.updateRobinhoodConfig({
        robinhoodUsername: robinhoodUsername.trim() || undefined,
        mcpUrl: mcpUrl.trim()
      });
      setStatus("Robinhood/MCP configuration saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save Robinhood config.");
    }
  };

  const startRobinhoodConnect = async () => {
    setIsConnectingRobinhood(true);
    setConnectFeedback("Requesting Robinhood OAuth redirect URL...");
    setStatus("Redirecting to Robinhood login...");
    try {
      const callbackUrl = `${window.location.origin}${window.location.pathname}`;
      const result = await api.getRobinhoodConnectUrl(callbackUrl);
      setConnectFeedback("Redirecting to Robinhood...");
      window.location.assign(result.connectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start Robinhood OAuth connect.";
      setConnectFeedback(message);
      setStatus(message);
      setIsConnectingRobinhood(false);
    }
  };

  const logout = () => {
    clearTokens();
    setIsAuthed(false);
    setPrincipal("");
    setAccounts([]);
    setSelectedAccountId("");
    setSettings(null);
    setOpportunities([]);
    setAlerts([]);
    setPositions([]);
    setStatus("Logged out.");
  };

  const onSelectAccount = async (accountId: string) => {
    setSelectedAccountId(accountId);
    try {
      await loadAccountData(accountId);
      setStatus(`Loaded account ${accountId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load account.");
    }
  };

  const onSettingChange = (key: keyof AdminSettings, value: boolean | number) => {
    if (!settings) {
      return;
    }
    setSettings({
      ...settings,
      [key]: value
    });
  };

  const saveSettings = async () => {
    if (!settings || !selectedAccountId) {
      return;
    }
    try {
      const updated = await api.updateSettings(selectedAccountId, settings);
      setSettings(updated);
      setStatus("Settings saved.");
      await loadAccountData(selectedAccountId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save settings.");
    }
  };

  const executeTrade = async (opportunityId: string) => {
    if (!selectedAccountId) {
      return;
    }
    try {
      const result = await api.executeTrade(selectedAccountId, opportunityId);
      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Trade execution failed.");
    }
  };

  const createAccount = async () => {
    const label = newAccountLabel.trim();
    if (!label) {
      setStatus("Enter an account label first.");
      return;
    }
    const watchlist = newAccountWatchlist
      .split(",")
      .map((entry) => entry.trim().toUpperCase())
      .filter((entry) => entry.length > 0);
    try {
      await api.createAccount(label, watchlist);
      const updatedAccounts = await api.getAccounts();
      setAccounts(updatedAccounts);
      const created = updatedAccounts[updatedAccounts.length - 1];
      if (created) {
        setSelectedAccountId(created.id);
        await loadAccountData(created.id);
      }
      setNewAccountLabel("");
      setStatus("Account added.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create account.");
    }
  };

  const loadContext = async (symbol: string) => {
    if (!selectedAccountId) {
      return;
    }
    try {
      const summary = await api.getContextSummary(selectedAccountId, symbol);
      setContextSummary(summary);
      setStatus(`Loaded context for ${symbol}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load context.");
    }
  };

  const mcpHelpSection = (
    <section className="card mcp-guide">
      <h2>Robinhood connection model</h2>
      <ol className="help-list">
        <li>
          <strong>Preferred:</strong> use <strong>Connect Robinhood</strong> to complete OAuth and capture MCP credentials automatically.
        </li>
        <li>
          <strong>Fallback:</strong> enter MCP URL manually if you already have one configured.
        </li>
      </ol>
      <p className="field-hint">
        Expected URL format: <code>{EXAMPLE_MCP_URL}</code>
      </p>
      <p className="field-hint">
        OAuth-captured API keys are encrypted per user on the server and are never shown in the UI.
      </p>
    </section>
  );

  if (!isAuthed) {
    return (
      <div className="app-shell">
        <header className="header">
          <h1>Trading Copilot</h1>
          <p>Register, verify, login, then configure Robinhood MCP per user.</p>
        </header>

        <section className="card create-account">
          <h2>1) Register</h2>
          <input type="text" placeholder="Email (optional)" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="text" placeholder="Phone (optional)" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button
            type="button"
            className="action"
            disabled={isRegistering}
            onClick={() => void register()}
          >
            {isRegistering ? "Registering..." : "Register"}
          </button>
          <p className="inline-feedback" role="status" aria-live="polite">
            {registerFeedback}
          </p>
        </section>

        <section className="card create-account">
          <h2>2) Verify</h2>
          {autoVerifiedOnRegister ? (
            <p className="dev-code-box">
              Verification is auto-completed in this environment. You can skip this step and proceed to Login.
            </p>
          ) : null}
          <p className="field-hint">
            Enter the <strong>6-digit verification code</strong> sent to {verificationTarget || "your email or phone"}.
          </p>
          {deliveryMessage ? <p className="field-hint">{deliveryMessage}</p> : null}
          {devVerificationCode ? (
            <p className="dev-code-box">
              Dev verification code: <strong>{devVerificationCode}</strong>
            </p>
          ) : null}
          <p className="field-hint">
            You do not need to enter a challenge ID manually. It is captured automatically after registration.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            placeholder="6-digit verification code"
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
          />
          <button
            type="button"
            className="action"
            disabled={autoVerifiedOnRegister || !challengeId || !verificationCode.trim()}
            onClick={() => void verify()}
          >
            Verify
          </button>
        </section>

        <section className="card create-account">
          <h2>3) Login</h2>
          <input
            type="text"
            placeholder="Email or phone"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
          <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button type="button" className="action" disabled={isLoggingIn} onClick={() => void login()}>
            {isLoggingIn ? "Logging in..." : "Login"}
          </button>
          <p className="inline-feedback" role="status" aria-live="polite">
            {loginFeedback}
          </p>
        </section>

        {mcpHelpSection}

        <footer className="status-bar">Status: {status}</footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="header">
        <h1>Trading Copilot</h1>
        <p>Logged in as {principal}</p>
      </header>

      <section className="card create-account">
        <h2>Robinhood + MCP Configuration</h2>
        <p className="field-hint">Use OAuth connect to fetch API credentials automatically, then optionally adjust MCP URL.</p>
        <p className="field-hint">
          Optional display name helps label your account space. No Robinhood password is collected.
        </p>
        <button type="button" className="action" disabled={isConnectingRobinhood} onClick={() => void startRobinhoodConnect()}>
          {isConnectingRobinhood ? "Connecting..." : "Connect Robinhood"}
        </button>
        <p className="inline-feedback" role="status" aria-live="polite">
          {connectFeedback}
        </p>
        <input
          type="text"
          placeholder="Display name (optional)"
          value={robinhoodUsername}
          onChange={(event) => setRobinhoodUsername(event.target.value)}
        />
        <input type="text" placeholder={`MCP URL (e.g. ${EXAMPLE_MCP_URL})`} value={mcpUrl} onChange={(event) => setMcpUrl(event.target.value)} />
        <div className="row-actions">
          <button type="button" className="action" onClick={() => void updateBrokerConfig()}>
            Save Broker Config
          </button>
          <button type="button" className="action" onClick={logout}>
            Logout
          </button>
        </div>
      </section>

      {mcpHelpSection}

      <section className="card">
        <h2>Portfolio Spaces</h2>
        <div className="account-list">
          {accounts.map((account) => (
            <button
              type="button"
              key={account.id}
              className={account.id === selectedAccountId ? "account active" : "account"}
              onClick={() => void onSelectAccount(account.id)}
            >
              {account.label} ({account.provider})
            </button>
          ))}
        </div>
        <div className="create-account">
          <input
            type="text"
            placeholder="New account label"
            value={newAccountLabel}
            onChange={(event) => setNewAccountLabel(event.target.value)}
          />
          <input
            type="text"
            placeholder="Watchlist symbols (comma-separated)"
            value={newAccountWatchlist}
            onChange={(event) => setNewAccountWatchlist(event.target.value)}
          />
          <button type="button" className="action" onClick={() => void createAccount()}>
            Add Account
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Administrative Settings {selectedAccount ? `- ${selectedAccount.label}` : ""}</h2>
        {!settings ? (
          <p>Loading settings...</p>
        ) : (
          <>
            <div className="settings-grid">
              {(Object.keys(settings) as Array<keyof AdminSettings>).map((key) => {
                const isNumber = numberSettingKeys.includes(key);
                return (
                  <label key={key} className="setting-row">
                    <span>{settingLabels[key]}</span>
                    {isNumber ? (
                      <input
                        type="number"
                        step={key === "highSignalThreshold" ? "0.01" : "0.1"}
                        min={0}
                        max={key === "highSignalThreshold" ? 1 : undefined}
                        value={settings[key] as number}
                        onChange={(event) => onSettingChange(key, Number(event.target.value))}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={settings[key] as boolean}
                        onChange={(event) => onSettingChange(key, event.target.checked)}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <button type="button" className="action" onClick={() => void saveSettings()}>
              Save Settings
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>Top Premium Opportunities</h2>
        <div className="list">
          {opportunities.map((opportunity) => (
            <article key={opportunity.id} className="opportunity">
              <div className="opportunity-top">
                <strong>{opportunity.symbol}</strong>
                <span className={`tier ${opportunity.tier}`}>{opportunity.tier} premium</span>
              </div>
              <p>{opportunity.summary}</p>
              <ul>
                <li>Premium: ${opportunity.premium.toFixed(2)}</li>
                <li>Signal: {(opportunity.signalScore * 100).toFixed(0)}%</li>
                <li>Premium %: {opportunity.risk.premiumPct}%</li>
                <li>Assign Prob: {opportunity.risk.assignmentProbability}%</li>
                <li>Allocation Impact: {opportunity.risk.allocationImpact}%</li>
              </ul>
              {opportunity.recommendation ? <p className="neutral-note">{opportunity.recommendation}</p> : null}
              <div className="row-actions">
                <button type="button" className="action" onClick={() => void loadContext(opportunity.symbol)}>
                  Why move?
                </button>
                <button type="button" className="action" onClick={() => void executeTrade(opportunity.id)}>
                  Execute Trade
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card grid-2">
        <div>
          <h2>Risk/Context Alerts</h2>
          <ul className="list">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <strong>{new Date(alert.createdAt).toLocaleTimeString()}</strong> - {alert.message}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Position Monitor</h2>
          <ul className="list">
            {positions.map((position) => (
              <li key={position.id}>
                <strong>{position.symbol}</strong> ({position.strategy}) - PnL ${position.pnl.toFixed(2)} ({position.pnlPct}%)
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        <h2>Market Context Interpreter</h2>
        {!contextSummary ? (
          <p>Select an opportunity and tap "Why move?" to load concise context.</p>
        ) : (
          <div>
            <p>
              <strong>{contextSummary.symbol}</strong>: {contextSummary.movementSummary}
            </p>
            <p>
              Sentiment: <strong>{contextSummary.sentiment}</strong> | Confidence:{" "}
              <strong>{Math.round(contextSummary.confidence * 100)}%</strong>
            </p>
            <ul>
              {contextSummary.keyEvents.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="status-bar">Status: {status}</footer>
    </div>
  );
}

export default App;
