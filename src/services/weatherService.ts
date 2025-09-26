// Weather service with realistic weather simulation based on location and seasonal patterns
// For production use, replace with actual weather API integration

export interface WeatherData {
  temperature: number
  condition: 'clear' | 'clouds' | 'rain' | 'thunderstorm' | 'snow' | 'mist'
  description: string
  humidity: number
  windSpeed: number
  icon: string
}

export interface WeatherForecast {
  date: string
  temperature: {
    min: number
    max: number
  }
  condition: 'clear' | 'clouds' | 'rain' | 'thunderstorm' | 'snow' | 'mist'
  description: string
  icon: string
}

// Mapping of park locations to coordinates for weather API calls
const PARK_COORDINATES: Record<string, { lat: number; lon: number; city: string }> = {
  'magic-kingdom': { lat: 28.3772, lon: -81.5707, city: 'Orlando, FL' },
  'epcot': { lat: 28.3747, lon: -81.5494, city: 'Orlando, FL' },
  'hollywood-studios': { lat: 28.3575, lon: -81.5582, city: 'Orlando, FL' },
  'animal-kingdom': { lat: 28.3553, lon: -81.5901, city: 'Orlando, FL' },
  'blizzard-beach': { lat: 28.3507, lon: -81.5776, city: 'Orlando, FL' },
  'typhoon-lagoon': { lat: 28.3687, lon: -81.5291, city: 'Orlando, FL' },
  'disneyland': { lat: 33.8121, lon: -117.9190, city: 'Anaheim, CA' },
  'disney-california-adventure': { lat: 33.8073, lon: -117.9190, city: 'Anaheim, CA' },
  'universal-studios-orlando': { lat: 28.4755, lon: -81.4683, city: 'Orlando, FL' },
  'islands-of-adventure': { lat: 28.4684, lon: -81.4689, city: 'Orlando, FL' },
  'epic-universe': { lat: 28.4683, lon: -81.4695, city: 'Orlando, FL' },
  'volcano-bay': { lat: 28.4631, lon: -81.4726, city: 'Orlando, FL' },
  'universal-studios-hollywood': { lat: 34.1381, lon: -118.3534, city: 'Hollywood, CA' },
  'six-flags-magic-mountain': { lat: 34.4253, lon: -118.5969, city: 'Valencia, CA' },
  'six-flags-great-adventure': { lat: 40.1465, lon: -74.4416, city: 'Jackson, NJ' },
  'six-flags-hurricane-harbor-nj': { lat: 40.1465, lon: -74.4416, city: 'Jackson, NJ' },
  'cedar-point': { lat: 41.4781, lon: -82.6831, city: 'Sandusky, OH' },
  'cedar-point-shores': { lat: 41.4781, lon: -82.6831, city: 'Sandusky, OH' },
  'knotts-berry-farm': { lat: 33.8442, lon: -118.0001, city: 'Buena Park, CA' }
}

// Convert OpenWeatherMap condition codes to our simplified conditions
function mapWeatherCondition(condition: string, description: string): WeatherData['condition'] {
  const conditionLower = condition.toLowerCase()
  const descLower = description.toLowerCase()
  
  if (conditionLower === 'clear') return 'clear'
  if (conditionLower === 'clouds') return 'clouds'
  if (conditionLower === 'rain' || conditionLower === 'drizzle') return 'rain'
  if (conditionLower === 'thunderstorm') return 'thunderstorm'
  if (conditionLower === 'snow') return 'snow'
  if (conditionLower === 'mist' || conditionLower === 'fog' || conditionLower === 'haze') return 'mist'
  
  // Fallback based on description
  if (descLower.includes('rain')) return 'rain'
  if (descLower.includes('storm')) return 'thunderstorm'
  if (descLower.includes('snow')) return 'snow'
  if (descLower.includes('cloud')) return 'clouds'
  if (descLower.includes('clear') || descLower.includes('sun')) return 'clear'
  
  return 'clear' // Default fallback
}

// Cache weather data for 10 minutes to avoid excessive API calls
const weatherCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

// For production use, integrate with actual weather API
const USE_MOCK_DATA = true // Using mock data to prevent CORS and API issues

export async function getCurrentWeather(parkId: string): Promise<WeatherData | null> {
  try {
    const coordinates = PARK_COORDINATES[parkId]
    if (!coordinates) {
      console.warn(`No coordinates found for park: ${parkId}`)
      return null
    }

    // For demo purposes, return realistic weather data based on location and season
    if (USE_MOCK_DATA) {
      return generateRealisticWeather(coordinates, new Date())
    }

    const cacheKey = `current-${parkId}`
    const cached = weatherCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`Using cached weather data for ${parkId}`)
      return parseCurrentWeather(cached.data)
    }

    console.log(`Fetching current weather for ${parkId} (${coordinates.city})`)
    
    try {
      // Use a free weather service that doesn't require API keys
      // Using wttr.in which provides weather data in JSON format
      const weatherResponse = await fetch(`https://wttr.in/${coordinates.lat},${coordinates.lon}?format=j1`)
      
      if (!weatherResponse.ok) {
        console.warn(`Weather API returned ${weatherResponse.status}, falling back to realistic data`)
        return generateRealisticWeather(coordinates, new Date())
      }
      
      const weatherData = await weatherResponse.json()
      
      // Cache the response
      weatherCache.set(cacheKey, { data: weatherData, timestamp: Date.now() })
      
      return parseWttrWeather(weatherData)
    } catch (apiError) {
      console.warn('Weather API failed, using realistic fallback:', apiError)
      return generateRealisticWeather(coordinates, new Date())
    }
  } catch (error) {
    console.error(`Failed to fetch weather for ${parkId}:`, error)
    const coordinates = PARK_COORDINATES[parkId]
    if (coordinates) {
      return generateRealisticWeather(coordinates, new Date())
    }
    return null
  }
}

export async function getWeatherForecast(parkId: string, days: number = 7): Promise<WeatherForecast[]> {
  try {
    const coordinates = PARK_COORDINATES[parkId]
    if (!coordinates) {
      console.warn(`No coordinates found for park: ${parkId}`)
      return []
    }

    // For demo purposes, return realistic weather data based on location and season
    if (USE_MOCK_DATA) {
      return generateRealisticForecast(coordinates, days)
    }

    const cacheKey = `forecast-${parkId}-${days}`
    const cached = weatherCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`Using cached forecast data for ${parkId}`)
      return parseForecastWeather(cached.data, days)
    }

    console.log(`Fetching weather forecast for ${parkId} (${coordinates.city})`)
    
    try {
      // Use wttr.in for forecast data - get 3-day forecast
      const forecastResponse = await fetch(`https://wttr.in/${coordinates.lat},${coordinates.lon}?format=j1`)
      
      if (!forecastResponse.ok) {
        console.warn(`Weather API returned ${forecastResponse.status}, falling back to realistic data`)
        return generateRealisticForecast(coordinates, days)
      }
      
      const forecastData = await forecastResponse.json()
      
      // Cache the response
      weatherCache.set(cacheKey, { data: forecastData, timestamp: Date.now() })
      
      return parseWttrForecast(forecastData, days)
    } catch (apiError) {
      console.warn('Weather forecast API failed, using realistic fallback:', apiError)
      return generateRealisticForecast(coordinates, days)
    }
  } catch (error) {
    console.error(`Failed to fetch forecast for ${parkId}:`, error)
    const coordinates = PARK_COORDINATES[parkId]
    if (coordinates) {
      return generateRealisticForecast(coordinates, days)
    }
    return []
  }
}

function parseWttrWeather(data: any): WeatherData {
  try {
    const current = data.current_condition?.[0]
    if (!current) {
      throw new Error('No current condition data')
    }

    const tempF = parseInt(current.temp_F || '70')
    const condition = mapWttrCondition(current.weatherCode, current.weatherDesc?.[0]?.value || '')
    
    return {
      temperature: tempF,
      condition: condition.condition,
      description: condition.description,
      humidity: parseInt(current.humidity || '50'),
      windSpeed: Math.round(parseFloat(current.windspeedMiles || '5')),
      icon: `${condition.condition}-day`
    }
  } catch (error) {
    console.warn('Failed to parse wttr.in weather data:', error)
    // Return a default weather object
    return {
      temperature: 75,
      condition: 'clear',
      description: 'clear sky',
      humidity: 50,
      windSpeed: 5,
      icon: 'clear-day'
    }
  }
}

function mapWttrCondition(code: string, description: string): { condition: WeatherData['condition']; description: string } {
  const codeNum = parseInt(code || '113')
  const desc = description.toLowerCase()
  
  // wttr.in weather codes mapping
  if (codeNum === 113) return { condition: 'clear', description: 'clear sky' }
  if (codeNum >= 116 && codeNum <= 119) return { condition: 'clouds', description: 'partly cloudy' }
  if (codeNum >= 122 && codeNum <= 143) return { condition: 'clouds', description: 'overcast' }
  if (codeNum >= 176 && codeNum <= 179) return { condition: 'rain', description: 'patchy rain' }
  if (codeNum >= 182 && codeNum <= 186) return { condition: 'rain', description: 'light rain' }
  if (codeNum >= 200 && codeNum <= 204) return { condition: 'thunderstorm', description: 'thundery outbreaks' }
  if (codeNum >= 227 && codeNum <= 230) return { condition: 'snow', description: 'blowing snow' }
  if (codeNum >= 248 && codeNum <= 260) return { condition: 'mist', description: 'fog' }
  if (codeNum >= 263 && codeNum <= 266) return { condition: 'rain', description: 'patchy light drizzle' }
  if (codeNum >= 281 && codeNum <= 284) return { condition: 'rain', description: 'freezing drizzle' }
  if (codeNum >= 293 && codeNum <= 296) return { condition: 'rain', description: 'patchy light rain' }
  if (codeNum >= 299 && codeNum <= 302) return { condition: 'rain', description: 'moderate rain' }
  if (codeNum >= 305 && codeNum <= 308) return { condition: 'rain', description: 'heavy rain' }
  if (codeNum >= 311 && codeNum <= 317) return { condition: 'rain', description: 'freezing rain' }
  if (codeNum >= 320 && codeNum <= 325) return { condition: 'rain', description: 'light rain shower' }
  if (codeNum >= 326 && codeNum <= 335) return { condition: 'rain', description: 'heavy rain shower' }
  if (codeNum >= 338 && codeNum <= 342) return { condition: 'snow', description: 'heavy snow' }
  if (codeNum >= 350 && codeNum <= 365) return { condition: 'rain', description: 'ice pellets' }
  if (codeNum >= 368 && codeNum <= 377) return { condition: 'snow', description: 'light snow showers' }
  if (codeNum >= 386 && codeNum <= 395) return { condition: 'thunderstorm', description: 'patchy light rain with thunder' }
  
  // Fallback based on description
  if (desc.includes('rain')) return { condition: 'rain', description }
  if (desc.includes('thunder') || desc.includes('storm')) return { condition: 'thunderstorm', description }
  if (desc.includes('snow')) return { condition: 'snow', description }
  if (desc.includes('cloud')) return { condition: 'clouds', description }
  if (desc.includes('fog') || desc.includes('mist')) return { condition: 'mist', description }
  
  return { condition: 'clear', description: desc || 'clear sky' }
}

function parseCurrentWeather(data: any): WeatherData {
  return {
    temperature: Math.round(data.main.temp),
    condition: mapWeatherCondition(data.weather[0].main, data.weather[0].description),
    description: data.weather[0].description,
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind?.speed || 0),
    icon: data.weather[0].icon
  }
}

function parseWttrForecast(data: any, maxDays: number): WeatherForecast[] {
  try {
    const forecasts: WeatherForecast[] = []
    const weather = data.weather || []
    
    for (let i = 0; i < Math.min(maxDays, weather.length); i++) {
      const day = weather[i]
      if (!day) continue
      
      const date = day.date
      const minTempF = parseInt(day.mintempF || '60')
      const maxTempF = parseInt(day.maxtempF || '80')
      
      // Use the hourly data from mid-day for main condition
      const hourlyData = day.hourly || []
      const midDayData = hourlyData.find((h: any) => parseInt(h.time || '1200') >= 1200) || hourlyData[0]
      
      if (midDayData) {
        const condition = mapWttrCondition(midDayData.weatherCode, midDayData.weatherDesc?.[0]?.value || '')
        
        forecasts.push({
          date: date,
          temperature: { min: minTempF, max: maxTempF },
          condition: condition.condition,
          description: condition.description,
          icon: `${condition.condition}-day`
        })
      }
    }
    
    return forecasts
  } catch (error) {
    console.warn('Failed to parse wttr.in forecast data, using fallback')
    return []
  }
}

function parseForecastWeather(data: any, maxDays: number): WeatherForecast[] {
  const forecasts: WeatherForecast[] = []
  const dailyData = new Map<string, any[]>()
  
  // Group forecast data by day
  data.list.forEach((item: any) => {
    const date = new Date(item.dt * 1000).toISOString().split('T')[0]
    if (!dailyData.has(date)) {
      dailyData.set(date, [])
    }
    dailyData.get(date)!.push(item)
  })

  // Process each day's data
  let processedDays = 0
  for (const [date, dayData] of dailyData) {
    if (processedDays >= maxDays) break
    
    // Find min/max temperatures for the day
    const temps = dayData.map((item: any) => item.main.temp)
    const minTemp = Math.round(Math.min(...temps))
    const maxTemp = Math.round(Math.max(...temps))
    
    // Use midday weather condition (or first available)
    const midDayItem = dayData.find((item: any) => {
      const hour = new Date(item.dt * 1000).getHours()
      return hour >= 12 && hour <= 15
    }) || dayData[0]
    
    forecasts.push({
      date,
      temperature: { min: minTemp, max: maxTemp },
      condition: mapWeatherCondition(midDayItem.weather[0].main, midDayItem.weather[0].description),
      description: midDayItem.weather[0].description,
      icon: midDayItem.weather[0].icon
    })
    
    processedDays++
  }

  return forecasts
}

// Helper function to get weather for a specific date (for calendar)
export async function getWeatherForDate(parkId: string, date: Date): Promise<WeatherData | null> {
  const today = new Date()
  const diffTime = date.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  // If it's today or yesterday, get current weather
  if (diffDays <= 1 && diffDays >= -1) {
    return getCurrentWeather(parkId)
  }
  
  // If it's within the next 5 days, get from forecast
  if (diffDays > 1 && diffDays <= 5) {
    const forecasts = await getWeatherForecast(parkId, 5)
    const dateStr = date.toISOString().split('T')[0]
    const forecast = forecasts.find(f => f.date === dateStr)
    
    if (forecast) {
      return {
        temperature: Math.round((forecast.temperature.min + forecast.temperature.max) / 2),
        condition: forecast.condition,
        description: forecast.description,
        humidity: 0, // Not available in forecast
        windSpeed: 0, // Not available in forecast
        icon: forecast.icon
      }
    }
  }
  
  // For dates beyond forecast range, return null (will fall back to placeholder)
  return null
}

// Realistic weather generation based on location and seasonal patterns
function generateRealisticWeather(coordinates: { lat: number; lon: number; city: string }, date: Date): WeatherData {
  const month = date.getMonth() // 0-11
  const day = date.getDate()
  const { lat, city } = coordinates
  
  // Base temperature ranges by location and season
  const getBaseTemp = () => {
    // Florida locations (Orlando area)
    if (city.includes('Orlando')) {
      const summerTemp = 85 + Math.random() * 10 - 5 // 80-95°F
      const winterTemp = 65 + Math.random() * 15 - 7 // 58-80°F
      const springFallTemp = 75 + Math.random() * 15 - 7 // 68-90°F
      
      if (month >= 5 && month <= 8) return summerTemp // June-Sept
      if (month >= 11 || month <= 2) return winterTemp // Dec-Mar
      return springFallTemp
    }
    
    // California locations
    if (city.includes('CA')) {
      const summerTemp = 75 + Math.random() * 15 - 7 // 68-90°F
      const winterTemp = 55 + Math.random() * 20 - 10 // 45-75°F
      const springFallTemp = 65 + Math.random() * 15 - 7 // 58-80°F
      
      if (month >= 5 && month <= 8) return summerTemp
      if (month >= 11 || month <= 2) return winterTemp
      return springFallTemp
    }
    
    // Other locations (like Ohio, New Jersey)
    const summerTemp = 70 + Math.random() * 20 - 10 // 60-90°F
    const winterTemp = 35 + Math.random() * 25 - 12 // 23-60°F
    const springFallTemp = 55 + Math.random() * 20 - 10 // 45-75°F
    
    if (month >= 5 && month <= 8) return summerTemp
    if (month >= 11 || month <= 2) return winterTemp
    return springFallTemp
  }
  
  // Weather condition probabilities by season and location
  const getWeatherCondition = (): { condition: WeatherData['condition']; description: string } => {
    const seed = (day + month * 31) % 100
    
    // Florida - more thunderstorms in summer, generally sunny
    if (city.includes('Orlando')) {
      if (month >= 5 && month <= 8) { // Summer
        if (seed < 40) return { condition: 'clear', description: 'sunny' }
        if (seed < 60) return { condition: 'clouds', description: 'partly cloudy' }
        if (seed < 85) return { condition: 'thunderstorm', description: 'thunderstorms' }
        return { condition: 'rain', description: 'light rain' }
      } else { // Winter/Spring/Fall
        if (seed < 70) return { condition: 'clear', description: 'sunny' }
        if (seed < 85) return { condition: 'clouds', description: 'partly cloudy' }
        return { condition: 'rain', description: 'light rain' }
      }
    }
    
    // California - dry, less rain
    if (city.includes('CA')) {
      if (month >= 10 || month <= 3) { // Winter
        if (seed < 50) return { condition: 'clear', description: 'sunny' }
        if (seed < 75) return { condition: 'clouds', description: 'partly cloudy' }
        return { condition: 'rain', description: 'light rain' }
      } else { // Summer
        if (seed < 80) return { condition: 'clear', description: 'sunny' }
        return { condition: 'clouds', description: 'partly cloudy' }
      }
    }
    
    // Other locations - more varied weather
    if (month >= 11 || month <= 2) { // Winter
      if (seed < 30) return { condition: 'clear', description: 'clear' }
      if (seed < 55) return { condition: 'clouds', description: 'cloudy' }
      if (seed < 75) return { condition: 'rain', description: 'rain' }
      if (seed < 90) return { condition: 'snow', description: 'light snow' }
      return { condition: 'thunderstorm', description: 'winter storm' }
    } else { // Spring/Summer/Fall
      if (seed < 45) return { condition: 'clear', description: 'sunny' }
      if (seed < 70) return { condition: 'clouds', description: 'partly cloudy' }
      if (seed < 90) return { condition: 'rain', description: 'rain' }
      return { condition: 'thunderstorm', description: 'thunderstorms' }
    }
  }
  
  const temperature = Math.round(getBaseTemp())
  const weather = getWeatherCondition()
  
  return {
    temperature,
    condition: weather.condition,
    description: weather.description,
    humidity: Math.round(40 + Math.random() * 40), // 40-80%
    windSpeed: Math.round(3 + Math.random() * 8), // 3-11 mph
    icon: `${weather.condition}-day` // Mock icon format
  }
}

function generateRealisticForecast(coordinates: { lat: number; lon: number; city: string }, days: number): WeatherForecast[] {
  const forecasts: WeatherForecast[] = []
  const today = new Date()
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    
    // Generate weather for this date
    const morningWeather = generateRealisticWeather(coordinates, date)
    const eveningWeather = generateRealisticWeather(coordinates, date)
    
    // Create temperature range
    const minTemp = Math.min(morningWeather.temperature, eveningWeather.temperature)
    const maxTemp = Math.max(morningWeather.temperature, eveningWeather.temperature) + Math.random() * 10
    
    forecasts.push({
      date: date.toISOString().split('T')[0],
      temperature: {
        min: Math.round(minTemp),
        max: Math.round(maxTemp)
      },
      condition: morningWeather.condition,
      description: morningWeather.description,
      icon: morningWeather.icon
    })
  }
  
  return forecasts
}