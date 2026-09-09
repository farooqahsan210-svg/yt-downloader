const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const app = express();

const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'terms.html'));
});

// Helper function to include cookies automatically if uploaded
function getBaseYtArgs() {
  let args = ['--no-playlist', '--extractor-args', 'youtube:player_client=android,web'];
  const cookiePath = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookiePath)) {
    args.push('--cookies', cookiePath);
  }
  return args;
}

// 1. Fetch Real Metadata Endpoint
app.post('/convert', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Please enter a valid YouTube link." });
  }

  const ytArgs = [...getBaseYtArgs(), '--dump-json', url];
  const ytDlp = spawn('yt-dlp', ytArgs);
  let dataString = '';
  let errorString = '';

  ytDlp.stdout.on('data', (data) => {
    dataString += data;
  });

  ytDlp.stderr.on('data', (data) => {
    errorString += data;
  });

  ytDlp.on('close', (code) => {
    if (code !== 0) {
      console.error("yt-dlp error:", errorString);
      return res.status(500).json({ error: "Failed to fetch video info. Check the URL." });
    }
    try {
      const info = JSON.parse(dataString);
      const minutes = Math.floor(info.duration / 60);
      const seconds = (info.duration % 60).toString().padStart(2, '0');
      
      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: `${minutes}:${seconds}`,
        webpage_url: info.webpage_url
      });
    } catch (e) {
      res.status(500).json({ error: "Parsing error." });
    }
  });
});

// 2. Download Endpoint with Timeout Disabled for Long Videos (20m, 40m, 120m+)
app.get('/download', (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);

  const { url, quality } = req.query;
  if (!url) return res.status(400).send("URL is required");

  const uniqueId = Date.now();
  let filename = quality === 'mp3' ? `audio_${uniqueId}.mp3` : `video_${uniqueId}.mp4`;
  let outputPath = path.join(__dirname, filename);

  let ytArgs = [...getBaseYtArgs()];
  if (quality === 'mp3') {
    ytArgs.push(
      '-x', '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputPath,
      url
    );
  } else {
    let formatSelector = 'bestvideo+bestaudio/best';
    if (quality === '1080p') formatSelector = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
    if (quality === '720p') formatSelector = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
    if (quality === '360p') formatSelector = 'bestvideo[height<=360]+bestaudio/best[height<=360]';
    
    ytArgs.push(
      '-f', formatSelector,
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      url
    );
  }

  console.log(`Starting download for: ${url} (${quality}) - This may take a while for long videos.`);
  const downloadProcess = spawn('yt-dlp', ytArgs);

  downloadProcess.stdout.on('data', (data) => {
    console.log(`yt-dlp: ${data}`);
  });

  downloadProcess.stderr.on('data', (data) => {
    console.error(`yt-dlp err: ${data}`);
  });

  downloadProcess.on('close', (code) => {
    if (code !== 0 || !fs.existsSync(outputPath)) {
      console.log(`Download failed with exit code ${code}`);
      return res.status(500).send("Download failed.");
    }

    console.log(`Download completed successfully. Sending file to client...`);
    res.download(outputPath, quality === 'mp3' ? 'audio.mp3' : `video_${quality}.mp4`, (err) => {
      try {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
