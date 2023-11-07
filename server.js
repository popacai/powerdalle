const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const axios = require('axios');
const crypto = require('crypto');

require('dotenv').config();

app.use(express.json());
app.use(express.static('public'));

const allowedStyles = ['vivid', 'natural'];


app.post('/generate-image', async (req, res) => {

  const { prompt, style, resolution, quality } = req.body;
  
  console.log(`Now working on received prompt "${prompt}" with style "${style}", resolution "${resolution}", and quality "${quality}"`);

  if (!allowedStyles.includes(style)) {
    return res.status(400).send('Invalid style value provided.');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DALLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        n: 1,
        size: resolution,
        style: style,
        quality: quality,
        model: "dall-e-3"
      }),
    });

    const data = await response.json();

    console.log("Dall-E returned:");
    console.log(data);

    const imageUrl = data.data[0].url;
    const revisedPrompt = data.data[0].revised_prompt;
    let filename;
    
    axios({
        method: 'get',
        url: imageUrl,
        responseType: 'stream'
      })
      .then(function (response) {

        const guid = crypto.randomBytes(4).toString('hex');
        const dateTime = getFormattedDateTime();
        
        const filenameBase = `${dateTime}-${style}-${quality}-${resolution}-${guid}`;
        filename = `${filenameBase}.png`;
        const filepath = path.join(__dirname, 'images', filename);
        const promptPath = path.join(__dirname, 'images', `${filenameBase}.prompt`);
        
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
          writer.on('finish', () => {
            fs.writeFileSync(promptPath, prompt + '\n---\n' + revisedPrompt);
            resolve();
          });
          writer.on('error', reject);
        });

      })
      .then(() => {
        res.json({ imageUrl: `/images/${filename}`, revisedPrompt: revisedPrompt });
      })
      .catch(error => {
        console.error('Error downloading or saving image:', error);
        res.status(500).send('Error processing image');
      });

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).send('Error generating image');
  }
});


app.get('/images-data', async (req, res) => {
  const imagesDir = path.join(__dirname, 'images');
  fs.readdir(imagesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ message: 'Unable to read images directory' });
    }

    const imageFiles = files.filter(file => file.endsWith('.png')).sort().reverse();

    const imagesData = imageFiles.map(filename => {
      const promptFile = filename.replace('.png', '.prompt');
      const promptPath = path.join(imagesDir, promptFile);
      const prompt = fs.readFileSync(promptPath, 'utf8');
      const imageUrl = `/images/${filename}`;

      return { imageUrl, prompt };
    });

    res.json(imagesData);
  });
});


app.use('/images', express.static(path.join(__dirname, 'images')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  const imagesDir = path.join(__dirname, 'images');
  if (!fs.existsSync(imagesDir)){
    fs.mkdirSync(imagesDir);
  }
});

function getFormattedDateTime() {
    const pad = (number) => number < 10 ? `0${number}` : number;
  
    const dateTimeNow = new Date();
    const year = dateTimeNow.getUTCFullYear();
    const month = pad(dateTimeNow.getUTCMonth() + 1);
    const date = pad(dateTimeNow.getUTCDate());
    const hours = pad(dateTimeNow.getUTCHours());
    const minutes = pad(dateTimeNow.getUTCMinutes());
    const seconds = pad(dateTimeNow.getUTCSeconds());
  
    return `${year}-${month}-${date}-${hours}-${minutes}-${seconds}`;
}
