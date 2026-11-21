import { useState } from 'react';
import { useApp } from '../store.jsx';
import { Icon } from '../components/Icons.jsx';

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

function SetupSteps({ children }) {
  return (
    <details className="setup">
      <summary>How to connect this account</summary>
      <ol>{children}</ol>
    </details>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function SettingsView() {
  const { settings, catalog, health, saveSettings, notify } = useApp();
  const [dryRun, setDryRun] = useState(settings?.dryRun ?? true);
  const [defaults, setDefaults] = useState(settings?.defaults || {});
  const [brand, setBrand] = useState(settings?.brand || { handle: '', watermark: false });
  const [saving, setSaving] = useState('');
  const [youtube, setYoutube] = useState({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    privacy: settings?.platforms?.youtube?.privacy || 'public',
  });
  const [tiktok, setTiktok] = useState({
    accessToken: '',
    privacy: settings?.platforms?.tiktok?.privacy || 'PUBLIC_TO_EVERYONE',
  });
  const [instagram, setInstagram] = useState({
    accessToken: '',
    igUserId: settings?.platforms?.instagram?.igUserId || '',
    publicBaseUrl: settings?.platforms?.instagram?.publicBaseUrl || '',
  });
  const [facebook, setFacebook] = useState({
    pageId: settings?.platforms?.facebook?.pageId || '',
    accessToken: '',
  });

  if (!settings || !catalog) return null;

  const platforms = settings.platforms;

  async function save(section, patch) {
    setSaving(section);
    try {
      await saveSettings(patch);
    } catch (error) {
      notify(error.message, 'bad');
    } finally {
      setSaving('');
    }
  }

  async function toggleDryRun(next) {
    setDryRun(next);
    await save('mode', { dryRun: next });
  }

  async function savePlatform(name, secretKeys, values, extra = {}) {
    const patch = { ...extra };
    for (const key of secretKeys) {
      if (values[key]) patch[key] = values[key];
    }
    await save(name, { platforms: { [name]: patch } });
    const cleared = {};
    for (const key of secretKeys) cleared[key] = '';
    if (name === 'youtube') setYoutube((current) => ({ ...current, ...cleared }));
    if (name === 'tiktok') setTiktok((current) => ({ ...current, ...cleared }));
    if (name === 'instagram') setInstagram((current) => ({ ...current, accessToken: '' }));
    if (name === 'facebook') setFacebook((current) => ({ ...current, accessToken: '' }));
  }

  async function clearPlatform(name, secretKeys) {
    const ok = window.confirm(`Remove the saved ${name} credentials from this machine?`);
    if (!ok) return;
    const patch = {};
    for (const key of secretKeys) patch[key] = '';
    await save(name, { platforms: { [name]: patch } });
  }

  const modelEntry = catalog.models[defaults.model] || catalog.models.base;

  return (
    <div className="settings-view">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-copy">
            Defaults for every cut, the brand mark, and the accounts that can receive a post. Nothing is shared until a
            platform is connected and dry run is off.
          </p>
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-col">
          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <h2>Posting mode</h2>
                <p className="card-sub">Dry run simulates every target and posts nothing.</p>
              </div>
              <Switch checked={dryRun} onChange={toggleDryRun} label="Dry run" />
            </header>
            <div className={`mode-banner ${dryRun ? 'dry' : 'live'}`}>
              <span className="dot" />
              <div>
                <strong>{dryRun ? 'Dry run is on' : 'Live posting is on'}</strong>
                <p>
                  {dryRun
                    ? 'Queue items resolve as simulations. Safe for testing the whole flow.'
                    : 'Queue items will call each connected platform. Double-check the caption and the schedule.'}
                </p>
              </div>
            </div>
          </section>

          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <h2>Cut defaults</h2>
                <p className="card-sub">What a newly opened project starts with.</p>
              </div>
            </header>
            <div className="form-grid two">
              <Field label="Whisper model">
                <select
                  value={defaults.model || 'base'}
                  onChange={(event) => setDefaults((current) => ({ ...current, model: event.target.value }))}
                >
                  {Object.entries(catalog.models).map(([id, entry]) => (
                    <option key={id} value={id}>
                      {entry.label} · {entry.size}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{modelEntry.note}</span>
              </Field>
              <Field label="Spoken language">
                <select
                  value={defaults.language || 'auto'}
                  onChange={(event) => setDefaults((current) => ({ ...current, language: event.target.value }))}
                >
                  {catalog.languages.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Aspect">
                <select
                  value={defaults.aspect || '9:16'}
                  onChange={(event) => setDefaults((current) => ({ ...current, aspect: event.target.value }))}
                >
                  {Object.values(catalog.aspects).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Layout">
                <select
                  value={defaults.layout || 'fill'}
                  onChange={(event) => setDefaults((current) => ({ ...current, layout: event.target.value }))}
                >
                  {catalog.layouts.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Caption style">
                <select
                  value={defaults.captionStyle || catalog.defaultStyle}
                  onChange={(event) => setDefaults((current) => ({ ...current, captionStyle: event.target.value }))}
                >
                  {catalog.styles.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.styles.map((style) => (
                        <option key={style.id} value={style.id}>
                          {style.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Words per cue">
                <select
                  value={defaults.wordsPerCue || 4}
                  onChange={(event) => setDefaults((current) => ({ ...current, wordsPerCue: Number(event.target.value) }))}
                >
                  {[3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>
                      {count} words
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="card-actions">
              <button type="button" className="btn primary" onClick={() => save('defaults', { defaults })} disabled={saving === 'defaults'}>
                {saving === 'defaults' ? 'Saving…' : 'Save defaults'}
              </button>
            </div>
          </section>

          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <h2>Brand mark</h2>
                <p className="card-sub">A small handle in the top-left corner of every render.</p>
              </div>
              <Switch
                checked={Boolean(brand.watermark)}
                onChange={(next) => setBrand((current) => ({ ...current, watermark: next }))}
                label="Watermark renders"
              />
            </header>
            <Field label="Handle" hint="Include the @ if you want it on screen.">
              <input
                value={brand.handle || ''}
                maxLength={60}
                placeholder="@yourhandle"
                onChange={(event) => setBrand((current) => ({ ...current, handle: event.target.value }))}
              />
            </Field>
            <div className="brand-preview">
              <span>{brand.watermark && brand.handle ? brand.handle : '@yourhandle'}</span>
              <p>{brand.watermark ? 'Visible on renders' : 'Hidden on renders'}</p>
            </div>
            <div className="card-actions">
              <button type="button" className="btn primary" onClick={() => save('brand', { brand })} disabled={saving === 'brand'}>
                {saving === 'brand' ? 'Saving…' : 'Save brand'}
              </button>
            </div>
          </section>

          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <h2>Engines</h2>
                <p className="card-sub">Installed tools this app calls directly.</p>
              </div>
            </header>
            <div className="engine-list">
              <div>
                <span>FFmpeg</span>
                <strong>{health?.ffmpeg || 'Missing'}</strong>
              </div>
              <div>
                <span>yt-dlp</span>
                <strong>{health?.ytdlp || 'Missing'}</strong>
              </div>
              <div>
                <span>Node</span>
                <strong>{health?.node || 'Unknown'}</strong>
              </div>
              <div>
                <span>Whisper</span>
                <strong>{health?.modelsCached ? 'Model cached' : 'Downloads on first run'}</strong>
              </div>
              <div>
                <span>Browser</span>
                <strong>{health?.chrome ? 'Chrome found' : 'Not required'}</strong>
              </div>
            </div>
            <p className="hint">
              If FFmpeg or yt-dlp says missing, restart the app from a terminal so it can see the updated PATH.
            </p>
          </section>
        </div>

        <div className="settings-col">
          <div className="platform-note">
            <Icon name="alert" size={16} />
            <p>
              Credentials live in <code>data/settings.json</code> on this machine. They are only sent to the platform they
              belong to. Use app-specific tokens, never a password.
            </p>
          </div>

          <section className="panel platform-card">
            <header className="platform-head">
              <div>
                <h2>YouTube Shorts</h2>
                <p>YouTube Data API v3 · resumable upload</p>
              </div>
              <span className={`conn ${platforms.youtube.configured ? 'on' : ''}`}>
                {platforms.youtube.configured ? 'Connected' : 'Not connected'}
              </span>
            </header>
            <div className="form-grid two">
              <Field label="Client ID">
                <input
                  type="password"
                  autoComplete="off"
                  value={youtube.clientId}
                  placeholder={platforms.youtube.configured ? 'Saved — leave blank to keep' : '…apps.googleusercontent.com'}
                  onChange={(event) => setYoutube((current) => ({ ...current, clientId: event.target.value }))}
                />
              </Field>
              <Field label="Client secret">
                <input
                  type="password"
                  autoComplete="off"
                  value={youtube.clientSecret}
                  placeholder={platforms.youtube.configured ? 'Saved — leave blank to keep' : ''}
                  onChange={(event) => setYoutube((current) => ({ ...current, clientSecret: event.target.value }))}
                />
              </Field>
              <Field label="Refresh token">
                <input
                  type="password"
                  autoComplete="off"
                  value={youtube.refreshToken}
                  placeholder={platforms.youtube.configured ? 'Saved — leave blank to keep' : ''}
                  onChange={(event) => setYoutube((current) => ({ ...current, refreshToken: event.target.value }))}
                />
              </Field>
              <Field label="Privacy">
                <select
                  value={youtube.privacy}
                  onChange={(event) => setYoutube((current) => ({ ...current, privacy: event.target.value }))}
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </Field>
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  savePlatform('youtube', ['clientId', 'clientSecret', 'refreshToken'], youtube, {
                    privacy: youtube.privacy,
                  })
                }
                disabled={saving === 'youtube'}
              >
                {saving === 'youtube' ? 'Saving…' : 'Save YouTube'}
              </button>
              {platforms.youtube.configured ? (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => clearPlatform('youtube', ['clientId', 'clientSecret', 'refreshToken'])}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <SetupSteps>
              <li>Create a project in Google Cloud Console and enable the YouTube Data API v3.</li>
              <li>Configure the OAuth consent screen, then add yourself as a test user.</li>
              <li>Create an OAuth client of type “Desktop app” and copy its ID and secret here.</li>
              <li>
                In a terminal run <code>npm run youtube:auth -- --client-id YOUR_ID --client-secret YOUR_SECRET</code>.
                Approve access in the browser, then paste the refresh token above.
              </li>
              <li>
                Unverified API projects can keep uploads private until Google audits the app. That is a Google rule, not
                a setting here.
              </li>
            </SetupSteps>
          </section>

          <section className="panel platform-card">
            <header className="platform-head">
              <div>
                <h2>TikTok</h2>
                <p>Content Posting API · direct file upload</p>
              </div>
              <span className={`conn ${platforms.tiktok.configured ? 'on' : ''}`}>
                {platforms.tiktok.configured ? 'Connected' : 'Not connected'}
              </span>
            </header>
            <div className="form-grid two">
              <Field label="User access token">
                <input
                  type="password"
                  autoComplete="off"
                  value={tiktok.accessToken}
                  placeholder={platforms.tiktok.configured ? 'Saved — leave blank to keep' : 'act.…'}
                  onChange={(event) => setTiktok((current) => ({ ...current, accessToken: event.target.value }))}
                />
              </Field>
              <Field label="Privacy">
                <select
                  value={tiktok.privacy}
                  onChange={(event) => setTiktok((current) => ({ ...current, privacy: event.target.value }))}
                >
                  <option value="PUBLIC_TO_EVERYONE">Public</option>
                  <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
                  <option value="FOLLOWER_OF_CREATOR">Followers</option>
                  <option value="SELF_ONLY">Only me</option>
                </select>
              </Field>
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => savePlatform('tiktok', ['accessToken'], tiktok, { privacy: tiktok.privacy })}
                disabled={saving === 'tiktok'}
              >
                {saving === 'tiktok' ? 'Saving…' : 'Save TikTok'}
              </button>
              {platforms.tiktok.configured ? (
                <button type="button" className="btn ghost small" onClick={() => clearPlatform('tiktok', ['accessToken'])}>
                  Clear
                </button>
              ) : null}
            </div>
            <SetupSteps>
              <li>Create an app at developers.tiktok.com and add the Content Posting API product.</li>
              <li>Request the <code>video.publish</code> scope and complete the Login Kit OAuth flow.</li>
              <li>Paste the user access token above. Tokens expire, so re-authorise when posting starts failing.</li>
              <li>Unaudited apps can only post to private or self-only audiences. Public posting needs TikTok’s review.</li>
            </SetupSteps>
          </section>

          <section className="panel platform-card">
            <header className="platform-head">
              <div>
                <h2>Instagram Reels</h2>
                <p>Instagram Graph API · container publish</p>
              </div>
              <span className={`conn ${platforms.instagram.configured ? 'on' : ''}`}>
                {platforms.instagram.configured ? 'Connected' : 'Not connected'}
              </span>
            </header>
            <div className="form-grid two">
              <Field label="Instagram user ID">
                <input
                  value={instagram.igUserId}
                  placeholder="178414…"
                  onChange={(event) => setInstagram((current) => ({ ...current, igUserId: event.target.value }))}
                />
              </Field>
              <Field label="Long-lived access token">
                <input
                  type="password"
                  autoComplete="off"
                  value={instagram.accessToken}
                  placeholder={platforms.instagram.configured ? 'Saved — leave blank to keep' : ''}
                  onChange={(event) => setInstagram((current) => ({ ...current, accessToken: event.target.value }))}
                />
              </Field>
              <Field
                label="Public HTTPS base URL"
                hint="Instagram downloads the file, so the app needs a reachable address while publishing."
              >
                <input
                  value={instagram.publicBaseUrl}
                  placeholder="https://your-tunnel.trycloudflare.com"
                  onChange={(event) => setInstagram((current) => ({ ...current, publicBaseUrl: event.target.value }))}
                />
              </Field>
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  savePlatform('instagram', ['accessToken'], instagram, {
                    igUserId: instagram.igUserId,
                    publicBaseUrl: instagram.publicBaseUrl,
                  })
                }
                disabled={saving === 'instagram'}
              >
                {saving === 'instagram' ? 'Saving…' : 'Save Instagram'}
              </button>
              {platforms.instagram.configured ? (
                <button type="button" className="btn ghost small" onClick={() => clearPlatform('instagram', ['accessToken'])}>
                  Clear token
                </button>
              ) : null}
            </div>
            <SetupSteps>
              <li>Use an Instagram Business or Creator account linked to a Facebook Page.</li>
              <li>Create a Meta app, add the Instagram Graph API, and request instagram_content_publish.</li>
              <li>
                Get the IG user id from <code>GET /&#123;page-id&#125;?fields=instagram_business_account</code> and paste it
                above.
              </li>
              <li>Generate a long-lived token with instagram_basic, instagram_content_publish and pages_show_list.</li>
              <li>
                Start an HTTPS tunnel to this app, for example <code>cloudflared tunnel --url http://127.0.0.1:8787</code>,
                and paste the https origin above. Keep it running while the post publishes.
              </li>
            </SetupSteps>
          </section>

          <section className="panel platform-card">
            <header className="platform-head">
              <div>
                <h2>Facebook Page</h2>
                <p>Graph API · page video upload</p>
              </div>
              <span className={`conn ${platforms.facebook.configured ? 'on' : ''}`}>
                {platforms.facebook.configured ? 'Connected' : 'Not connected'}
              </span>
            </header>
            <div className="form-grid two">
              <Field label="Page ID">
                <input
                  value={facebook.pageId}
                  placeholder="1023…"
                  onChange={(event) => setFacebook((current) => ({ ...current, pageId: event.target.value }))}
                />
              </Field>
              <Field label="Page access token">
                <input
                  type="password"
                  autoComplete="off"
                  value={facebook.accessToken}
                  placeholder={platforms.facebook.configured ? 'Saved — leave blank to keep' : ''}
                  onChange={(event) => setFacebook((current) => ({ ...current, accessToken: event.target.value }))}
                />
              </Field>
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  savePlatform('facebook', ['accessToken'], facebook, { pageId: facebook.pageId })
                }
                disabled={saving === 'facebook'}
              >
                {saving === 'facebook' ? 'Saving…' : 'Save Facebook'}
              </button>
              {platforms.facebook.configured ? (
                <button type="button" className="btn ghost small" onClick={() => clearPlatform('facebook', ['accessToken'])}>
                  Clear token
                </button>
              ) : null}
            </div>
            <SetupSteps>
              <li>Make sure you can post to the Page as an admin.</li>
              <li>In your Meta app request pages_manage_posts and pages_read_engagement.</li>
              <li>
                Get a Page access token from <code>GET /me/accounts</code> and copy the Page id beside it.
              </li>
              <li>Paste both above. Reels posted to a Page are treated as normal videos by Facebook.</li>
            </SetupSteps>
          </section>
        </div>
      </div>
    </div>
  );
}
