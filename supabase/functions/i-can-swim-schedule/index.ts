import { corsHeaders } from '@supabase/supabase-js/cors'

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

    // First, discover the tables in the base to find the right table name
    // The Airtable screenshot shows "Individual Sessions" tab with columns:
    // Start Date, Client, Email, Booking Status, Instructor, Client Name, End Date
    const tableName = 'Individual Sessions'
    const encodedTable = encodeURIComponent(tableName)

    // Fetch records from Airtable, sorted by Start Date
    // We use a view or filter to get recent/upcoming sessions
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodedTable}`)
    url.searchParams.set('sort[0][field]', 'Start Date')
    url.searchParams.set('sort[0][direction]', 'asc')
    // Only fetch sessions from the last week onward
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const filterFormula = `IS_AFTER({Start Date}, '${oneWeekAgo.toISOString().split('T')[0]}')`
    url.searchParams.set('filterByFormula', filterFormula)

    const allRecords: any[] = []
    let offset: string | undefined = undefined

    // Paginate through all results
    do {
      const pageUrl = new URL(url.toString())
      if (offset) {
        pageUrl.searchParams.set('offset', offset)
      }

      const response = await fetch(pageUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
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

    console.log(`Fetched ${allRecords.length} records from Airtable`)

    // Log first record's field names for debugging
    if (allRecords.length > 0) {
      console.log('Field names:', Object.keys(allRecords[0].fields))
      console.log('Sample record:', JSON.stringify(allRecords[0].fields).slice(0, 500))
    }

    // Map Airtable records to our ICSSession format
    // Field names from the screenshot: Start Date, End Date, Client, Instructor, Booking Status
    const sessions = allRecords
      .filter((r: any) => r.fields['Start Date'] && r.fields['End Date'])
      .map((r: any) => ({
        id: r.id,
        start_time: r.fields['Start Date'],
        end_time: r.fields['End Date'],
        location: r.fields['Location'] || 'Modesto',
        session_type: r.fields['Session Type'] || r.fields['Type'] || 'lesson',
        status: (r.fields['Booking Status'] || 'open').toLowerCase(),
        max_capacity: r.fields['Max Capacity'] || r.fields['Capacity'] || 1,
        instructor_name: Array.isArray(r.fields['Instructor'])
          ? r.fields['Instructor'][0]
          : r.fields['Instructor'] || null,
        confirmed_bookings: r.fields['Booking Status']?.toLowerCase() === 'booked' ||
          r.fields['Booking Status']?.toLowerCase() === 'confirmed' ? 1 : 0,
        client_name: Array.isArray(r.fields['Client'])
          ? r.fields['Client'][0]
          : r.fields['Client'] || null,
      }))

    return new Response(
      JSON.stringify({ sessions, _meta: { source: 'airtable', total_records: allRecords.length } }),
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
