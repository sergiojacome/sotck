const { createApp } = Vue

createApp({
  data() {
    return {
      plans: [],
      sortKey: 'score',
      sortDir: 'desc',
    }
  },
  computed: {
    sortedPlans() {
      return this.plans.slice().sort((a, b) => {
        let valA = a[this.sortKey]
        let valB = b[this.sortKey]
        // For numbers, compare as numbers
        if (!isNaN(parseFloat(valA)) && !isNaN(parseFloat(valB))) {
          valA = parseFloat(valA)
          valB = parseFloat(valB)
        } else {
          valA = valA ? valA.toString().toLowerCase() : ''
          valB = valB ? valB.toString().toLowerCase() : ''
        }
        if (valA < valB) return this.sortDir === 'asc' ? -1 : 1
        if (valA > valB) return this.sortDir === 'asc' ? 1 : -1
        return 0
      })
    },
  },
  methods: {
    sortBy(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
      } else {
        this.sortKey = key
        this.sortDir = 'asc'
      }
    },
    loadCSV(event) {
      const file = event.target.files[0]
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const raw = results.data
          console.log('Raw CSV data (first row):', raw[0])
          console.log('Available columns:', Object.keys(raw[0]))

          // Normaliza claves quitando espacios
          this.plans = raw.map((row) => {
            const cleaned = {}
            Object.keys(row).forEach((k) => {
              cleaned[k.trim()] = row[k]
            })
            console.log('Cleaned row for symbol:', cleaned.Symbol, ':', cleaned)
            return this.calculatePlan(cleaned)
          })
        },
      })
    },
    calculatePlan(stock) {
      const get = (key) => {
        const value = parseFloat(stock[key] || 0) || 0
        console.log(`Getting ${key}:`, stock[key], '-> parsed:', value)
        return value
      }

      const symbol = stock.Symbol.trim()
      console.log('Processing symbol:', symbol)

      const price = get('Price')
      const vwap = get('Volume Weighted Average Price 1 day')
      const ema9 = get('Exponential Moving Average (9) 1 day')
      const ema21 = get('Exponential Moving Average (21) 1 day')
      const atr = get('Average True Range % (14) 1 day')
      const vol30 = get('Change from Open % 30 minutes')
      const rvol = get('Relative Volume 30 minutes')
      const rsi = get('Relative Strength Index (14) 1 week')
      const perf1w = get('Performance % 1W')

      console.log('Key values for', symbol, ':', {
        price,
        vwap,
        ema9,
        ema21,
        atr,
        vol30,
        rvol,
        rsi,
        perf1w,
      })

      // Earnings calc
      const earningsDate = new Date(stock['Upcoming earnings date'])
      const today = new Date()
      const daysToEarnings = Math.round(
        (earningsDate - today) / (1000 * 60 * 60 * 24)
      )

      // Dynamic entry calculation based on RSI + VWAP
      let entry
      if (rsi > 70 && price > vwap) {
        entry = vwap * 1.002 // Pullback al VWAP + 0.2%
      } else if (rsi < 30) {
        entry = price * 1.005 // Precio actual + 0.5% (momentum)
      } else if (rsi >= 30 && rsi <= 70 && price > vwap) {
        entry = vwap * 1.002 // VWAP + 0.2%
      } else {
        entry = price * 1.003 // Precio actual + 0.3% (potencial reversión/breakout)
      }

      const stop = vwap - vwap * (atr / 100) * 0.5
      const risk = entry - stop

      // Dynamic target calculation based on market conditions
      let targetMultiplier
      if (atr > 5 && rsi < 70) {
        targetMultiplier = 2.0 // Volatilidad alta, no sobrecompra
      } else if (rsi > 75 || atr < 2) {
        targetMultiplier = 1.0 // Sobrecompra o baja volatilidad
      } else {
        targetMultiplier = 1.5 // Por defecto
      }
      const target = entry + risk * targetMultiplier

      const riskPercent = ((risk / entry) * 100).toFixed(2)
      const rewardPercent = (((target - entry) / entry) * 100).toFixed(2)

      console.log('Trade calculations for', symbol, ':', {
        entry,
        stop,
        risk,
        target,
        riskPercent,
        rewardPercent,
      })

      // Scoring
      let score = 0
      score += (vol30 / 100) * 2
      score += (perf1w / 10) * 1.5
      score -= atr * 1.2
      score += ema9 > ema21 ? 2 : 0
      if (daysToEarnings < 7) score -= 3
      else if (daysToEarnings < 14) score -= 1
      else score += 1
      if (rsi > 75) score -= 2
      else if (rsi >= 55) score += 1
      if (Math.abs((price - vwap) / vwap) > 0.02) score -= 1
      else score += 1

      console.log('Score calculation for', symbol, ':', score)

      // Evaluación integral del setup
      let setupQuality = this.evaluateSetup({
        score,
        riskPercent: parseFloat(riskPercent),
        rewardPercent: parseFloat(rewardPercent),
        daysToEarnings,
        rsi,
        atr,
        vol30,
        ema9,
        ema21,
        price,
        vwap,
      })

      // Notes
      let notes = setupQuality.rating + '. '
      if (daysToEarnings < 7) notes += 'Earnings muy cerca. '
      if (rsi > 75) notes += 'Posible sobrecompra. '
      if (atr > 5) notes += 'Volatilidad alta. '
      if (setupQuality.reasons.length > 0) {
        notes += setupQuality.reasons.join(' ')
      }

      const result = {
        symbol,
        price,
        score,
        entry,
        stop,
        target,
        riskPercent,
        rewardPercent,
        notes: notes.trim(),
      }

      console.log('Final result for', symbol, ':', result)
      return result
    },
    evaluateSetup(params) {
      const reasons = []
      // Score
      if (params.score > 2) {
        var rating = 'Setup excelente'
      } else if (params.score > 0.5) {
        var rating = 'Setup bueno'
      } else {
        var rating = 'Setup débil'
      }
      // Risk/Reward
      if (params.riskPercent > 6) reasons.push('Riesgo alto.')
      if (params.rewardPercent < 4) reasons.push('Poca recompensa.')
      if (params.rewardPercent / params.riskPercent < 1.2)
        reasons.push('R/R bajo.')
      // Earnings
      if (params.daysToEarnings < 7) reasons.push('Earnings muy cerca.')
      // Volatilidad
      if (params.atr > 5) reasons.push('ATR alto.')
      // RSI
      if (params.rsi > 75) reasons.push('RSI sobrecompra.')
      if (params.rsi < 30) reasons.push('RSI sobreventa.')
      return { rating, reasons }
    },
    getSetupColor(notes) {
      if (notes.startsWith('Setup excelente')) {
        return '#22c55e' // verde
      } else if (notes.startsWith('Setup bueno')) {
        return '#eab308' // amarillo
      } else {
        return '#ef4444' // rojo
      }
    },
  },
}).mount('#app')
