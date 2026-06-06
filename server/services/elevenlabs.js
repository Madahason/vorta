const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')
const { exec }      = require('child_process')
const { promisify } = require('util')
const fs   = require('fs')
const path = require('path')

const execAsync = promisify(exec)

function getClient() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set')
  return new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
}

async function getVoices() {
  const client   = getClient()
  const response = await client.voices.getAll()
  return response.voices.map(v => ({
    voice_id:    v.voice_id,
    name:        v.name,
    category:    v.category,
    description: v.description,
    preview_url: v.preview_url,
    labels:      v.labels,
  }))
}

async function generateAudio({ text, voiceId, modelId = 'eleven_multilingual_v2', outputPath, voiceSettings = {} }) {
  const client = getClient()

  const audioStream = await client.textToSpeech.convert(voiceId, {
    text,
    modelId,
    outputFormat:  'mp3_44100_128',
    voiceSettings: {
      stability:       voiceSettings.stability       ?? 0.5,
      similarityBoost: voiceSettings.similarityBoost ?? 0.75,
      style:           voiceSettings.style           ?? 0.0,
      useSpeakerBoost: true,
    },
  })

  const chunks = []
  for await (const chunk of audioStream) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(outputPath, buffer)

  return outputPath
}

async function getAudioDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`
    )
    const d = parseFloat(stdout.trim())
    return isNaN(d) ? null : Math.round(d * 10) / 10
  } catch {
    return null
  }
}

module.exports = { getClient, getVoices, generateAudio, getAudioDuration }
