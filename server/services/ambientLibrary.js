const path = require('path')
const fs   = require('fs')

const AMBIENT_DIR = path.resolve(__dirname, '../../library/ambient')
if (!fs.existsSync(AMBIENT_DIR)) fs.mkdirSync(AMBIENT_DIR, { recursive: true })

// Pre-defined ambient loop catalog.
// Files are sourced by the user from Freesound.org (CC0 licensed).
// The AudioPanel download guide shows exact search URLs for each file.
const AMBIENT_CATALOG = {
  trading_floor: {
    filename:    'trading_floor.mp3',
    description: 'Stock exchange trading floor, shouting, ticker sounds',
    freesoundQuery: 'stock exchange trading floor',
    category:    'finance',
    loop:        true,
  },
  office_ambient: {
    filename:    'office_ambient.mp3',
    description: 'Quiet office, keyboard typing, air conditioning hum',
    freesoundQuery: 'office ambient background',
    category:    'business',
    loop:        true,
  },
  city_traffic: {
    filename:    'city_traffic.mp3',
    description: 'City street traffic, distant horns',
    freesoundQuery: 'city traffic street ambient',
    category:    'cities',
    loop:        true,
  },
  data_center_hum: {
    filename:    'data_center_hum.mp3',
    description: 'Server room, fans humming, cooling systems',
    freesoundQuery: 'server room data center hum',
    category:    'tech',
    loop:        true,
  },
  courtroom_silence: {
    filename:    'courtroom_silence.mp3',
    description: 'Quiet courtroom, distant murmur',
    freesoundQuery: 'courtroom indoor silence murmur',
    category:    'legal',
    loop:        true,
  },
  factory_floor: {
    filename:    'factory_floor.mp3',
    description: 'Factory machinery, assembly line sounds',
    freesoundQuery: 'factory machinery industrial ambient',
    category:    'industry',
    loop:        true,
  },
  crowd_murmur: {
    filename:    'crowd_murmur.mp3',
    description: 'Large crowd, distant conversation',
    freesoundQuery: 'crowd murmur ambient indoors',
    category:    'social',
    loop:        true,
  },
  government_hall: {
    filename:    'government_hall.mp3',
    description: 'Large government building, echoing footsteps, murmur',
    freesoundQuery: 'government building hall footsteps murmur',
    category:    'politics',
    loop:        true,
  },
  tension_drone: {
    filename:    'tension_drone.mp3',
    description: 'Low tension drone, cinematic suspense',
    freesoundQuery: 'tension drone cinematic dark ambient',
    category:    'mood',
    loop:        true,
  },
  soft_ambient: {
    filename:    'soft_ambient.mp3',
    description: 'Soft neutral ambient, subtle background texture',
    freesoundQuery: 'soft ambient neutral background texture',
    category:    'mood',
    loop:        true,
  },
  press_room: {
    filename:    'press_room.mp3',
    description: 'Press conference room, camera clicks, murmur',
    freesoundQuery: 'press conference room camera clicks',
    category:    'media',
    loop:        true,
  },
  airport_ambient: {
    filename:    'airport_ambient.mp3',
    description: 'Busy international airport, announcements, crowd',
    freesoundQuery: 'airport terminal ambient announcements',
    category:    'transportation',
    loop:        true,
  },
  industrial_hum: {
    filename:    'industrial_hum.mp3',
    description: 'Industrial machinery hum, energy plant background',
    freesoundQuery: 'industrial hum machinery energy plant',
    category:    'energy',
    loop:        true,
  },
}

function getAmbientForCategory(category) {
  const { categoryAmbientMap } = require('../config/musicMoods')
  const key     = categoryAmbientMap[category] || categoryAmbientMap.default
  return getAmbientByKey(key)
}

function getAmbientForMood(mood) {
  const { moodMap } = require('../config/musicMoods')
  const key = moodMap[mood]?.ambientCategory || 'soft_ambient'
  return getAmbientByKey(key)
}

function getAmbientByKey(key) {
  const ambient = AMBIENT_CATALOG[key]
  if (!ambient) return null
  const filePath = path.join(AMBIENT_DIR, ambient.filename)
  if (!fs.existsSync(filePath)) return null
  return {
    ...ambient,
    filePath,
    url: `/library/ambient/${ambient.filename}`,
  }
}

function listAmbientFiles() {
  return Object.entries(AMBIENT_CATALOG).map(([key, val]) => ({
    key,
    ...val,
    available:  fs.existsSync(path.join(AMBIENT_DIR, val.filename)),
    freesoundUrl: `https://freesound.org/search/?q=${encodeURIComponent(val.freesoundQuery)}&f=license%3A"Creative+Commons+0"&s=downloads+desc`,
  }))
}

module.exports = { AMBIENT_CATALOG, AMBIENT_DIR, getAmbientForCategory, getAmbientForMood, getAmbientByKey, listAmbientFiles }
