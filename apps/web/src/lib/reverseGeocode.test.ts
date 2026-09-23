import { describe, expect, it } from 'vitest';
import { formatLocalAddress } from './reverseGeocode';

describe('formatLocalAddress', () => {
  it('formats Road, Landmark, Area, Village, Taluk, District, Pincode only', () => {
    const line = formatLocalAddress({
      road: 'MG Road',
      amenity: 'Primary School',
      suburb: 'Serilingampally',
      village: 'Gachibowli',
      county: 'Ranga Reddy',
      state_district: 'Hyderabad',
      postcode: '500032',
    });

    expect(line).toBe(
      'MG Road, Primary School, Serilingampally, Gachibowli, Ranga Reddy, Hyderabad, 500032',
    );
  });

  it('omits missing parts and never includes state or country fields we ignore', () => {
    const line = formatLocalAddress({
      road: 'Temple Street',
      suburb: 'Kampli',
      state_district: 'Ballari',
      postcode: '583132',
    });

    expect(line).toBe('Temple Street, Kampli, Ballari, 583132');
    expect(line).not.toMatch(/Karnataka|India|Telangana|Andhra/i);
  });

  it('dedupes when the same name appears at two levels', () => {
    const line = formatLocalAddress({
      suburb: 'Kampli',
      village: 'Kampli',
      state_district: 'Ballari',
    });

    expect(line).toBe('Kampli, Ballari');
  });
});
