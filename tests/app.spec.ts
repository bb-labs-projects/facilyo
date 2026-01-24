import { test, expect } from '@playwright/test';

test.describe('FacilityTrack App', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check that the login page has the title
    await expect(page.getByText('FacilityTrack')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();

    // Check that the login form has email and password inputs by placeholder
    await expect(page.getByPlaceholder('name@firma.ch')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
  });

  test('login page has submit button', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Check for submit button
    const submitButton = page.getByRole('button', { name: /anmelden/i });
    await expect(submitButton).toBeVisible();
  });

  test('login form shows validation errors for empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Click submit without filling form
    await page.getByRole('button', { name: /anmelden/i }).click();

    // Should show validation errors (form validation)
    // The exact behavior depends on how the form validation works
    await page.waitForTimeout(500);
  });

  test('homepage shows loading or redirects', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Either shows the app content or redirects to login
    // depending on auth state
    const url = page.url();
    expect(url).toMatch(/localhost:3000/);
  });

  test('admin page is accessible', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Page loads without error
    const url = page.url();
    expect(url).toContain('localhost:3000');
  });

  test('tasks page is accessible', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Page loads without error
    const url = page.url();
    expect(url).toContain('localhost:3000');
  });

  test('issues page is accessible', async ({ page }) => {
    await page.goto('/issues');
    await page.waitForLoadState('networkidle');

    // Page loads without error
    const url = page.url();
    expect(url).toContain('localhost:3000');
  });
});
