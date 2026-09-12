'use server';

import { createClient } from '@/lib/supabase/server';

interface ResolveAddressResponse {
  success: boolean;
  error?: string;
  data?: {
    lat: number;
    lng: number;
    locationId?: string;
  };
}

export async function resolveAddress(profileId: string, address: string, locationName = 'Custom Work Site'): Promise<ResolveAddressResponse> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Kayod-HR-Attendance-System (contact: dev@kayod.app)',
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      throw new Error('Nominatim API failure');
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        error: "Invalid address location mapping parameters. Please provide more descriptive regional keys.",
      };
    }

    const { lat, lon } = data[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    const supabase = await createClient();

    // Insert or update work_locations table record
    const { data: newLocation, error: locError } = await supabase
      .from('work_locations')
      .insert({
        name: locationName,
        address: address,
        latitude: latitude,
        longitude: longitude,
        radius_meters: 200,
        is_default: false,
      })
      .select('id')
      .single();

    if (locError || !newLocation) {
      console.error('Work location creation error:', locError);
      return { success: false, error: "System failed to store resolved site coordinates." };
    }

    // Link location to profile & employee
    await supabase
      .from('profiles')
      .update({ work_location_id: newLocation.id })
      .eq('id', profileId);

    await supabase
      .from('employees')
      .update({ work_location_id: newLocation.id })
      .eq('profile_id', profileId);

    return {
      success: true,
      data: { lat: latitude, lng: longitude, locationId: newLocation.id }
    };
  } catch (error) {
    console.error('Address resolution exception:', error);
    return {
      success: false,
      error: "Critical failure during geo-pipeline resolution.",
    };
  }
}
