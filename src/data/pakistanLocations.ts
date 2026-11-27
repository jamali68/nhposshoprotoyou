/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Official Pakistan Provinces / Administrative Units & Districts Master Dataset
 * Used on Shop Sign Up (Province + District required, City optional), Shop Profile,
 * and Super Admin Geo-Targeted Push Notifications & Private Popup Ads Studio.
 */

export interface PakistanProvinceData {
  name: string;
  urduName: string;
  districts: string[];
}

export const PAKISTAN_PROVINCES: PakistanProvinceData[] = [
  {
    name: 'Punjab',
    urduName: 'پنجاب',
    districts: [
      'Attock',
      'Bahawalnagar',
      'Bahawalpur',
      'Bhakkar',
      'Chakwal',
      'Chiniot',
      'Dera Ghazi Khan',
      'Faisalabad',
      'Gujranwala',
      'Gujrat',
      'Hafizabad',
      'Jhang',
      'Jhelum',
      'Kasur',
      'Khanewal',
      'Khushab',
      'Kot Addu',
      'Lahore',
      'Layyah',
      'Lodhran',
      'Mandi Bahauddin',
      'Mianwali',
      'Multan',
      'Murree',
      'Muzaffargarh',
      'Nankana Sahib',
      'Narowal',
      'Okara',
      'Pakpattan',
      'Rahim Yar Khan',
      'Rajanpur',
      'Rawalpindi',
      'Sahiwal',
      'Sargodha',
      'Sheikhupura',
      'Sialkot',
      'Talagang',
      'Taunsa',
      'Toba Tek Singh',
      'Vehari',
      'Wazirabad'
    ]
  },
  {
    name: 'Sindh',
    urduName: 'سندھ',
    districts: [
      'Badin',
      'Dadu',
      'Ghotki',
      'Hyderabad',
      'Jacobabad',
      'Jamshoro',
      'Kambar Shahdadkot',
      'Karachi Central',
      'Karachi East',
      'Karachi South',
      'Karachi West',
      'Kashmore',
      'Keamari',
      'Khairpur',
      'Korangi',
      'Larkana',
      'Malir',
      'Matiari',
      'Mirpur Khas',
      'Naushahro Feroze',
      'Sanghar',
      'Shaheed Benazirabad',
      'Shikarpur',
      'Sujawal',
      'Sukkur',
      'Tando Allahyar',
      'Tando Muhammad Khan',
      'Tharparkar',
      'Thatta',
      'Umerkot'
    ]
  },
  {
    name: 'Khyber Pakhtunkhwa (KPK)',
    urduName: 'خیبر پختونخوا',
    districts: [
      'Abbottabad',
      'Bajaur',
      'Bannu',
      'Battagram',
      'Buner',
      'Charsadda',
      'Chitral Lower',
      'Chitral Upper',
      'Dera Ismail Khan',
      'Hangu',
      'Haripur',
      'Karak',
      'Khyber',
      'Kohat',
      'Kohistan Lower',
      'Kohistan Upper',
      'Kolai-Palas',
      'Kurram',
      'Lakki Marwat',
      'Lower Dir',
      'Malakand',
      'Mansehra',
      'Mardan',
      'Mohmand',
      'North Waziristan',
      'Nowshera',
      'Orakzai',
      'Peshawar',
      'Shangla',
      'South Waziristan',
      'Swabi',
      'Swat',
      'Tank',
      'Torghar',
      'Upper Dir'
    ]
  },
  {
    name: 'Balochistan',
    urduName: 'بلوچستان',
    districts: [
      'Awaran',
      'Barkhan',
      'Chagai',
      'Chaman',
      'Dera Bugti',
      'Duki',
      'Gwadar',
      'Harnai',
      'Hub',
      'Jafarabad',
      'Jhal Magsi',
      'Kachhi',
      'Kalat',
      'Kech',
      'Kharan',
      'Khuzdar',
      'Killa Abdullah',
      'Killa Saifullah',
      'Kohlu',
      'Lasbela',
      'Loralai',
      'Mastung',
      'Musakhel',
      'Nasirabad',
      'Nushki',
      'Panjgur',
      'Pishin',
      'Quetta',
      'Sherani',
      'Sibi',
      'Sohbatpur',
      'Surab',
      'Usta Muhammad',
      'Washuk',
      'Zhob',
      'Ziarat'
    ]
  },
  {
    name: 'Islamabad Capital Territory',
    urduName: 'اسلام آباد',
    districts: ['Islamabad']
  },
  {
    name: 'Azad Jammu & Kashmir (AJK)',
    urduName: 'آزاد کشمیر',
    districts: [
      'Bagh',
      'Bhimber',
      'Hattian Bala',
      'Haveli',
      'Kotli',
      'Mirpur',
      'Muzaffarabad',
      'Neelum',
      'Poonch',
      'Sudhnuti'
    ]
  },
  {
    name: 'Gilgit-Baltistan',
    urduName: 'گلگت بلتستان',
    districts: [
      'Astore',
      'Diamer',
      'Ghanche',
      'Ghizer',
      'Gilgit',
      'Hunza',
      'Kharmang',
      'Nagar',
      'Shigar',
      'Skardu'
    ]
  }
];

export function getDistrictsForProvince(provinceName?: string): string[] {
  if (!provinceName) return [];
  const clean = provinceName.trim().toLowerCase();
  const found = PAKISTAN_PROVINCES.find(p => p.name.toLowerCase() === clean);
  return found ? found.districts : [];
}

export function formatShopLocationLine(loc: {
  city?: string;
  district?: string;
  province?: string;
  address?: string;
}): string {
  const parts = [loc.city, loc.district, loc.province]
    .map(v => String(v || '').trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return String(loc.address || '').trim();
}
