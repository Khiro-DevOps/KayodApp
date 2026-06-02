'use server';

import { createClient } from '@/lib/supabase/server';

interface ResolveAddressResponse {
  success: boolean;
  error?: string;
  data?: {
    lat: number;
    lng: number;
  };
}

export async function resolveAddress(profileId: string, address: string): Promise<ResolveAddressResponse> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Kayod-HR-Attendance-System (contact: dev@kayod.app)',
      },
      next: { revalidate: 86400 }, // Cache for 24 hours
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
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        work_lat: latitude,
        work_lng: longitude,
      })
      .eq('id', profileId);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return { success: false, error: "System failed to store resolved coordinates." };
    }

    return { 
      success: true, 
      data: { lat: latitude, lng: longitude } 
    };
  } catch (error) {
    console.error('Address resolution exception:', error);
    return {
      success: false,
      error: "Critical failure during geo-pipeline resolution.",
    };
  }
}
