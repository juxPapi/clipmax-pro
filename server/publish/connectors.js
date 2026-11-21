// Official platform connectors. Each one uses the platform's own API with the
// credentials you save in Settings. No scraping, no password sharing.

import fs from 'node:fs/promises';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 600) };
  }
  if (!response.ok) {
    const detail =
      data?.error?.message ||
      data?.error_description ||
      data?.message ||
      (typeof data === 'string' ? data : JSON.stringify(data))?.slice(0, 500);
    throw new Error(`${response.status} ${detail || response.statusText}`);
  }
  return data;
}

function captionText({ title, description, hashtags }) {
  const tags = (hashtags || []).join(' ');
  return [description || title || '', tags].filter(Boolean).join('\n\n').slice(0, 4900);
}

// -------------------------------------------------------------------- YouTube

let youtubeToken = { key: '', token: '', expiresAt: 0 };

async function youtubeAccessToken(platform) {
  const key = `${platform.clientId}:${platform.refreshToken}`;
  if (youtubeToken.key === key && youtubeToken.expiresAt > Date.now() + 60_000) return youtubeToken.token;
  const body = new URLSearchParams({
    client_id: platform.clientId,
    client_secret: platform.clientSecret,
    refresh_token: platform.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await readJson(response);
  if (!data.access_token) throw new Error('Google did not return an access token. Reconnect the YouTube account.');
  youtubeToken = {
    key,
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

export async function publishYouTube({ filePath, title, description, hashtags, settings }) {
  const platform = settings.platforms.youtube;
  if (!platform.clientId || !platform.clientSecret || !platform.refreshToken) {
    throw new Error('YouTube is missing its client ID, client secret or refresh token. Open Settings → YouTube.');
  }
  const token = await youtubeAccessToken(platform);
  const buffer = await fs.readFile(filePath);
  const metadata = {
    snippet: {
      title: String(title || 'Clip').slice(0, 100),
      description: captionText({ title, description, hashtags }).slice(0, 5000),
      tags: (hashtags || []).map((tag) => tag.replace(/^#/, '')).slice(0, 15),
      categoryId: '20',
    },
    status: {
      privacyStatus: platform.privacy || 'public',
      selfDeclaredMadeForKids: false,
    },
  };

  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(buffer.length),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!init.ok) await readJson(init);
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL.');

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });
  const data = await readJson(upload);
  return {
    ok: true,
    id: data.id,
    url: data.id ? `https://youtube.com/watch?v=${data.id}` : null,
    note: 'Uploaded. Unverified API projects can keep uploads private until Google audits the app.',
  };
}

// --------------------------------------------------------------------- TikTok

export async function publishTikTok({ filePath, title, description, hashtags, settings }) {
  const platform = settings.platforms.tiktok;
  if (!platform.accessToken) {
    throw new Error('TikTok needs a user access token. Open Settings → TikTok for the OAuth steps.');
  }
  const buffer = await fs.readFile(filePath);
  const size = buffer.length;
  const init = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${platform.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: captionText({ title, description, hashtags }).slice(0, 2200),
        privacy_level: platform.privacy || 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1200,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: size,
        chunk_size: size,
        total_chunk_count: 1,
      },
    }),
  });
  const initData = await readJson(init);
  const uploadUrl = initData?.data?.upload_url;
  const publishId = initData?.data?.publish_id;
  if (!uploadUrl || !publishId) throw new Error('TikTok did not return an upload URL.');

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Content-Range': `bytes 0-${size - 1}/${size}`,
    },
    body: buffer,
  });
  if (!upload.ok) {
    const detail = await upload.text();
    throw new Error(`TikTok upload failed: ${upload.status} ${detail.slice(-400)}`);
  }

  let status = 'PROCESSING_UPLOAD';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(3000);
    const poll = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${platform.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const pollData = await readJson(poll);
    status = pollData?.data?.status || status;
    if (status === 'PUBLISH_COMPLETE' || status === 'FAILED') break;
  }
  if (status === 'FAILED') throw new Error('TikTok rejected the post during processing.');
  return { ok: true, id: publishId, url: null, note: `TikTok status: ${status}` };
}

// ------------------------------------------------------------------ Instagram

export async function publishInstagram({ filePath, title, description, hashtags, settings, publicPath }) {
  const platform = settings.platforms.instagram;
  if (!platform.accessToken || !platform.igUserId) {
    throw new Error('Instagram needs a user ID and a long-lived access token. Open Settings → Instagram.');
  }
  if (!platform.publicBaseUrl || !/^https:\/\//i.test(platform.publicBaseUrl)) {
    throw new Error(
      'Instagram downloads the video from a public HTTPS URL. Start a tunnel (for example cloudflared) and save its address as the public base URL in Settings → Instagram.'
    );
  }
  const publicUrl = `${platform.publicBaseUrl.replace(/\/$/, '')}${publicPath}`;
  const caption = captionText({ title, description, hashtags }).slice(0, 2200);
  const base = 'https://graph.facebook.com/v21.0';

  const create = await fetch(`${base}/${platform.igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: publicUrl,
      caption,
      share_to_feed: 'true',
      access_token: platform.accessToken,
    }),
  });
  const created = await readJson(create);
  const creationId = created.id;
  if (!creationId) throw new Error('Instagram did not return a container id.');

  let status = 'IN_PROGRESS';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(4000);
    const poll = await fetch(
      `${base}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(platform.accessToken)}`
    );
    const data = await readJson(poll);
    status = data.status_code || status;
    if (status === 'FINISHED' || status === 'ERROR' || status === 'EXPIRED') break;
  }
  if (status !== 'FINISHED') throw new Error(`Instagram container ended as ${status}. Check that the public URL plays.`);

  const publish = await fetch(`${base}/${platform.igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: creationId, access_token: platform.accessToken }),
  });
  const published = await readJson(publish);
  return {
    ok: true,
    id: published.id,
    url: published.id ? `https://www.instagram.com/reel/${published.id}` : null,
    note: 'Reel published.',
  };
}

// ------------------------------------------------------------------- Facebook

export async function publishFacebook({ filePath, title, description, hashtags, settings }) {
  const platform = settings.platforms.facebook;
  if (!platform.pageId || !platform.accessToken) {
    throw new Error('Facebook needs a page ID and a page access token. Open Settings → Facebook.');
  }
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('source', new Blob([buffer], { type: 'video/mp4' }), 'clip.mp4');
  form.append('title', String(title || 'Clip').slice(0, 200));
  form.append('description', captionText({ title, description, hashtags }));
  form.append('access_token', platform.accessToken);

  const response = await fetch(`https://graph-video.facebook.com/v21.0/${platform.pageId}/videos`, {
    method: 'POST',
    body: form,
  });
  const data = await readJson(response);
  return {
    ok: true,
    id: data.id,
    url: data.id ? `https://www.facebook.com/${data.id}` : null,
    note: 'Page video uploaded.',
  };
}

export const CONNECTORS = {
  youtube: publishYouTube,
  tiktok: publishTikTok,
  instagram: publishInstagram,
  facebook: publishFacebook,
};

export const TARGETS = [
  { id: 'youtube', label: 'YouTube Shorts', needsPublicUrl: false },
  { id: 'tiktok', label: 'TikTok', needsPublicUrl: false },
  { id: 'instagram', label: 'Instagram Reels', needsPublicUrl: true },
  { id: 'facebook', label: 'Facebook Page', needsPublicUrl: false },
];
