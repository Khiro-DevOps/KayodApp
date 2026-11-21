export interface PhProvinceOption {
  id: string;
  name: string;
}

export interface PhCityOption {
  id: string;
  name: string;
  province_id: string;
}

export const PH_PROVINCES: PhProvinceOption[] = [
  { id: "ph-prov-ncr", name: "Metro Manila (NCR)" },
  { id: "ph-prov-albay", name: "Albay" },
  { id: "ph-prov-batangas", name: "Batangas" },
  { id: "ph-prov-benguet", name: "Benguet" },
  { id: "ph-prov-bohol", name: "Bohol" },
  { id: "ph-prov-bulacan", name: "Bulacan" },
  { id: "ph-prov-camarines-sur", name: "Camarines Sur" },
  { id: "ph-prov-cavite", name: "Cavite" },
  { id: "ph-prov-cebu", name: "Cebu" },
  { id: "ph-prov-davao-del-sur", name: "Davao del Sur" },
  { id: "ph-prov-iloilo", name: "Iloilo" },
  { id: "ph-prov-laguna", name: "Laguna" },
  { id: "ph-prov-leyte", name: "Leyte" },
  { id: "ph-prov-misamis-oriental", name: "Misamis Oriental" },
  { id: "ph-prov-negros-occidental", name: "Negros Occidental" },
  { id: "ph-prov-nueva-ecija", name: "Nueva Ecija" },
  { id: "ph-prov-palawan", name: "Palawan" },
  { id: "ph-prov-pampanga", name: "Pampanga" },
  { id: "ph-prov-pangasinan", name: "Pangasinan" },
  { id: "ph-prov-quezon", name: "Quezon" },
  { id: "ph-prov-rizal", name: "Rizal" },
  { id: "ph-prov-south-cotabato", name: "South Cotabato" },
  { id: "ph-prov-tarlac", name: "Tarlac" },
  { id: "ph-prov-zambales", name: "Zambales" },
  { id: "ph-prov-zamboanga-del-sur", name: "Zamboanga del Sur" },
];

export const PH_CITIES: PhCityOption[] = [
  // Metro Manila (NCR)
  { id: "ph-city-caloocan", name: "Caloocan City", province_id: "ph-prov-ncr" },
  { id: "ph-city-las-pinas", name: "Las Piñas City", province_id: "ph-prov-ncr" },
  { id: "ph-city-makati", name: "Makati City", province_id: "ph-prov-ncr" },
  { id: "ph-city-malabon", name: "Malabon City", province_id: "ph-prov-ncr" },
  { id: "ph-city-mandaluyong", name: "Mandaluyong City", province_id: "ph-prov-ncr" },
  { id: "ph-city-manila", name: "Manila", province_id: "ph-prov-ncr" },
  { id: "ph-city-marikina", name: "Marikina City", province_id: "ph-prov-ncr" },
  { id: "ph-city-muntinlupa", name: "Muntinlupa City", province_id: "ph-prov-ncr" },
  { id: "ph-city-navotas", name: "Navotas City", province_id: "ph-prov-ncr" },
  { id: "ph-city-paranaque", name: "Parañaque City", province_id: "ph-prov-ncr" },
  { id: "ph-city-pasay", name: "Pasay City", province_id: "ph-prov-ncr" },
  { id: "ph-city-pasig", name: "Pasig City", province_id: "ph-prov-ncr" },
  { id: "ph-city-pateros", name: "Pateros", province_id: "ph-prov-ncr" },
  { id: "ph-city-quezon-city", name: "Quezon City", province_id: "ph-prov-ncr" },
  { id: "ph-city-san-juan", name: "San Juan City", province_id: "ph-prov-ncr" },
  { id: "ph-city-taguig", name: "Taguig City", province_id: "ph-prov-ncr" },
  { id: "ph-city-valenzuela", name: "Valenzuela City", province_id: "ph-prov-ncr" },

  // Cebu
  { id: "ph-city-bogo", name: "Bogo City", province_id: "ph-prov-cebu" },
  { id: "ph-city-carcar", name: "Carcar City", province_id: "ph-prov-cebu" },
  { id: "ph-city-cebu", name: "Cebu City", province_id: "ph-prov-cebu" },
  { id: "ph-city-consolacion", name: "Consolacion", province_id: "ph-prov-cebu" },
  { id: "ph-city-cordova", name: "Cordova", province_id: "ph-prov-cebu" },
  { id: "ph-city-danao", name: "Danao City", province_id: "ph-prov-cebu" },
  { id: "ph-city-lapu-lapu", name: "Lapu-Lapu City", province_id: "ph-prov-cebu" },
  { id: "ph-city-liloan", name: "Liloan", province_id: "ph-prov-cebu" },
  { id: "ph-city-mandaue", name: "Mandaue City", province_id: "ph-prov-cebu" },
  { id: "ph-city-minglanilla", name: "Minglanilla", province_id: "ph-prov-cebu" },
  { id: "ph-city-naga-cebu", name: "Naga City", province_id: "ph-prov-cebu" },
  { id: "ph-city-talisay-cebu", name: "Talisay City", province_id: "ph-prov-cebu" },
  { id: "ph-city-toledo", name: "Toledo City", province_id: "ph-prov-cebu" },

  // Davao del Sur
  { id: "ph-city-davao", name: "Davao City", province_id: "ph-prov-davao-del-sur" },
  { id: "ph-city-digos", name: "Digos City", province_id: "ph-prov-davao-del-sur" },
  { id: "ph-city-santa-cruz", name: "Santa Cruz", province_id: "ph-prov-davao-del-sur" },

  // Iloilo
  { id: "ph-city-iloilo", name: "Iloilo City", province_id: "ph-prov-iloilo" },
  { id: "ph-city-passi", name: "Passi City", province_id: "ph-prov-iloilo" },
  { id: "ph-city-oton", name: "Oton", province_id: "ph-prov-iloilo" },
  { id: "ph-city-pavia", name: "Pavia", province_id: "ph-prov-iloilo" },

  // Pampanga
  { id: "ph-city-angeles", name: "Angeles City", province_id: "ph-prov-pampanga" },
  { id: "ph-city-mabalacat", name: "Mabalacat City", province_id: "ph-prov-pampanga" },
  { id: "ph-city-san-fernando-pampanga", name: "San Fernando City", province_id: "ph-prov-pampanga" },

  // Laguna
  { id: "ph-city-binan", name: "Biñan City", province_id: "ph-prov-laguna" },
  { id: "ph-city-cabuyao", name: "Cabuyao City", province_id: "ph-prov-laguna" },
  { id: "ph-city-calamba", name: "Calamba City", province_id: "ph-prov-laguna" },
  { id: "ph-city-san-pablo", name: "San Pablo City", province_id: "ph-prov-laguna" },
  { id: "ph-city-san-pedro", name: "San Pedro City", province_id: "ph-prov-laguna" },
  { id: "ph-city-santa-rosa", name: "Santa Rosa City", province_id: "ph-prov-laguna" },

  // Cavite
  { id: "ph-city-bacoor", name: "Bacoor City", province_id: "ph-prov-cavite" },
  { id: "ph-city-cavite-city", name: "Cavite City", province_id: "ph-prov-cavite" },
  { id: "ph-city-dasmarinas", name: "Dasmariñas City", province_id: "ph-prov-cavite" },
  { id: "ph-city-general-trias", name: "General Trias City", province_id: "ph-prov-cavite" },
  { id: "ph-city-imus", name: "Imus City", province_id: "ph-prov-cavite" },
  { id: "ph-city-tagaytay", name: "Tagaytay City", province_id: "ph-prov-cavite" },
  { id: "ph-city-trece-martires", name: "Trece Martires City", province_id: "ph-prov-cavite" },

  // Rizal
  { id: "ph-city-antipolo", name: "Antipolo City", province_id: "ph-prov-rizal" },
  { id: "ph-city-cainta", name: "Cainta", province_id: "ph-prov-rizal" },
  { id: "ph-city-taytay", name: "Taytay", province_id: "ph-prov-rizal" },
  { id: "ph-city-binangonan", name: "Binangonan", province_id: "ph-prov-rizal" },

  // Bulacan
  { id: "ph-city-baliwag", name: "Baliwag City", province_id: "ph-prov-bulacan" },
  { id: "ph-city-malolos", name: "Malolos City", province_id: "ph-prov-bulacan" },
  { id: "ph-city-meycauayan", name: "Meycauayan City", province_id: "ph-prov-bulacan" },
  { id: "ph-city-san-jose-del-monte", name: "San Jose del Monte City", province_id: "ph-prov-bulacan" },

  // Batangas
  { id: "ph-city-batangas", name: "Batangas City", province_id: "ph-prov-batangas" },
  { id: "ph-city-lipa", name: "Lipa City", province_id: "ph-prov-batangas" },
  { id: "ph-city-tanauan", name: "Tanauan City", province_id: "ph-prov-batangas" },

  // Negros Occidental
  { id: "ph-city-bacolod", name: "Bacolod City", province_id: "ph-prov-negros-occidental" },
  { id: "ph-city-bago", name: "Bago City", province_id: "ph-prov-negros-occidental" },
  { id: "ph-city-silay", name: "Silay City", province_id: "ph-prov-negros-occidental" },
  { id: "ph-city-talisay-negros", name: "Talisay City", province_id: "ph-prov-negros-occidental" },

  // Bohol
  { id: "ph-city-tagbilaran", name: "Tagbilaran City", province_id: "ph-prov-bohol" },
  { id: "ph-city-panglao", name: "Panglao", province_id: "ph-prov-bohol" },

  // Leyte
  { id: "ph-city-ormoc", name: "Ormoc City", province_id: "ph-prov-leyte" },
  { id: "ph-city-tacloban", name: "Tacloban City", province_id: "ph-prov-leyte" },

  // Misamis Oriental
  { id: "ph-city-cdo", name: "Cagayan de Oro City", province_id: "ph-prov-misamis-oriental" },
  { id: "ph-city-gingoog", name: "Gingoog City", province_id: "ph-prov-misamis-oriental" },

  // Benguet
  { id: "ph-city-baguio", name: "Baguio City", province_id: "ph-prov-benguet" },
  { id: "ph-city-la-trinidad", name: "La Trinidad", province_id: "ph-prov-benguet" },

  // Albay
  { id: "ph-city-legazpi", name: "Legazpi City", province_id: "ph-prov-albay" },
  { id: "ph-city-tabaco", name: "Tabaco City", province_id: "ph-prov-albay" },

  // Camarines Sur
  { id: "ph-city-naga-cam-sur", name: "Naga City", province_id: "ph-prov-camarines-sur" },
  { id: "ph-city-iriga", name: "Iriga City", province_id: "ph-prov-camarines-sur" },

  // Nueva Ecija
  { id: "ph-city-cabanatuan", name: "Cabanatuan City", province_id: "ph-prov-nueva-ecija" },
  { id: "ph-city-palayan", name: "Palayan City", province_id: "ph-prov-nueva-ecija" },

  // Palawan
  { id: "ph-city-puerto-princesa", name: "Puerto Princesa City", province_id: "ph-prov-palawan" },

  // Pangasinan
  { id: "ph-city-dagupan", name: "Dagupan City", province_id: "ph-prov-pangasinan" },
  { id: "ph-city-urdaneta", name: "Urdaneta City", province_id: "ph-prov-pangasinan" },

  // Quezon
  { id: "ph-city-lucena", name: "Lucena City", province_id: "ph-prov-quezon" },
  { id: "ph-city-tayabas", name: "Tayabas City", province_id: "ph-prov-quezon" },

  // South Cotabato
  { id: "ph-city-gensan", name: "General Santos City", province_id: "ph-prov-south-cotabato" },
  { id: "ph-city-koronadal", name: "Koronadal City", province_id: "ph-prov-south-cotabato" },

  // Tarlac
  { id: "ph-city-tarlac", name: "Tarlac City", province_id: "ph-prov-tarlac" },

  // Zambales
  { id: "ph-city-olongapo", name: "Olongapo City", province_id: "ph-prov-zambales" },
  { id: "ph-city-subic", name: "Subic", province_id: "ph-prov-zambales" },

  // Zamboanga del Sur
  { id: "ph-city-zamboanga", name: "Zamboanga City", province_id: "ph-prov-zamboanga-del-sur" },
  { id: "ph-city-pagadian", name: "Pagadian City", province_id: "ph-prov-zamboanga-del-sur" },
];
