// Exercise the public scroll picker rather than setting its hidden civil-time value.
export async function choosePlannerTime(page, field, value) {
  await page.locator(`[data-time-input="${field}"]`).click();
  const [hour, minute] = value.split(':');
  await page.getByRole('listbox', {name: 'Hour', exact: true}).getByRole('option', {name: hour, exact: true}).click();
  await page.getByRole('listbox', {name: 'Minute', exact: true}).getByRole('option', {name: minute, exact: true}).click();
  await page.getByRole('button', {name: 'Use this time', exact: true}).click();
  await page.waitForFunction(({field, value}) => document.querySelector(`#plan-form [name="${field}"]`).value === value, {field, value});
}
