const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('AIRTABLE_API_KEY')
    const baseId = Deno.env.get('AIRTABLE_BASE_ID')

    if (!apiKey || !baseId) {
      return new Response(
        JSON.stringify({ error: 'Airtable credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Accept date range from request body
    let startDate: string
    let endDate: string

    try {
      const body = await req.json()
      startDate = body.startDate || new Date().toISOString().split('T')[0]
      endDate = body.endDate || startDate
    } catch {
      // Default to today only
      startDate = new Date().toISOString().split('T')[0]
      endDate = startDate
    }

    const tableName = 'Individual Sessions'
    const encodedTable = encodeURIComponent(tableName)

    // Filter to only the requested date range
    const filterFormula = `AND(IS_AFTER({Start Date}, '${startDate}'), IS_BEFORE({Start Date}, DATEADD('${endDate}', 1, 'days')))`

    const fields = [
      'Start Date',
      'End Date',
      'Instructor',
      'Booking Status',
      'Session Type',
      'Client Name (from Client)',
      'Client',
      'Day of the week',
      'Parent Name (from Client)',
      'Email (from Client)',
      'Phone Number (from Client) 2',
    ]

    const allRecords: any[] = []
    let offset: string | undefined = undefined

    do {
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodedTable}`)
      url.searchParams.set('sort[0][field]', 'Start Date')
      url.searchParams.set('sort[0][direction]', 'asc')
      url.searchParams.set('filterByFormula', filterFormula)
      fields.forEach((f, i) => url.searchParams.set(`fields[${i}]`, f))
      if (offset) url.searchParams.set('offset', offset)

      const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`Airtable API error [${response.status}]:`, errText)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch from Airtable', details: errText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const data = await response.json()
      allRecords.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    // Map Airtable records to ICSSession format
    const sessions = allRecords
      .filter((r: any) => r.fields['Start Date'] && r.fields['End Date'])
      .map((r: any) => {
        const f = r.fields
        const clientNameArr = f['Client Name (from Client)']
        const clientName = Array.isArray(clientNameArr) ? clientNameArr[0] : clientNameArr || null
        const instructor = Array.isArray(f['Instructor']) ? f['Instructor'][0] : f['Instructor'] || null
        const status = (f['Booking Status'] || 'open').toLowerCase()

        const parentNameArr = f['Parent Name (from Client)']
        const parentName = Array.isArray(parentNameArr) ? parentNameArr[0] : parentNameArr || null
        const emailArr = f['Email (from Client)']
        const email = Array.isArray(emailArr) ? emailArr[0] : emailArr || null
        const phoneArr = f['Phone Number (from Client) 2']
        const phone = Array.isArray(phoneArr) ? phoneArr[0] : phoneArr || null

        return {
          id: r.id,
          start_time: f['Start Date'],
          end_time: f['End Date'],
          location: 'Modesto',
          session_type: f['Session Type'] || 'lesson',
          status,
          max_capacity: 1,
          instructor_name: instructor,
          confirmed_bookings: (status === 'booked' || status === 'confirmed') ? 1 : 0,
          client_name: clientName,
          parent_name: parentName,
          parent_email: email,
          parent_phone: phone,
        }
      })

    return new Response(
      JSON.stringify({ sessions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
