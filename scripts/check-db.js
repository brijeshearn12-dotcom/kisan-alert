const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://twqmatbbgurqmrtlymcs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3cW1hdGJiZ3VycW1ydGx5bWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NDYzMjEsImV4cCI6MjA5ODMyMjMyMX0.Yism4hLxyEBxGivYnlUO9N5_62xKdOIHK1_wqZOhz_M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, count, error } = await supabase
    .from('districts')
    .select('id, name, state, latitude, longitude', { count: 'exact' });

  if (error) {
    console.error('Error fetching districts:', error);
    return;
  }
  
  console.log('Total districts count:', count);
  if (data && data.length > 0) {
    console.log('Sample districts (all):', data);
    const states = [...new Set(data.map(d => d.state))];
    console.log('Unique states in DB:', states);
  } else {
    console.log('No districts in database.');
  }
}

check();
