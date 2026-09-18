// Exercise the public scroll picker rather than setting its hidden civil-time value.
export async function choosePlannerTime(page, field, value) {
  await page.locator(`[data-time-input="${field}"]`).click();
  const [hour, minute] = value.split(':');
  await page.getByRole('listbox', {name: 'Hour', exact: true}).getByRole('option', {name: hour, exact: true}).click();
  await page.getByRole('listbox', {name: 'Minute', exact: true}).getByRole('option', {name: minute, exact: true}).click();
  await page.getByRole('button', {name: 'Use this time', exact: true}).click();
  await page.waitForFunction(({field, value}) => document.querySelector(`#plan-form [name="${field}"]`).value === value, {field, value});
}

export async function choosePlannerDate(page,field,value){
  await page.locator(`[data-date-input="${field}"]`).click();
  const grid=page.locator('.date-dialog[open] .calendar-grid');
  const current=await grid.locator('[aria-selected=true]').getAttribute('data-date');
  const months=(Number(value.slice(0,4))-Number(current.slice(0,4)))*12+Number(value.slice(5,7))-Number(current.slice(5,7));
  for(let i=0;i<Math.abs(months);i++)await page.locator(`.date-dialog[open] [data-month="${months>0?1:-1}"]`).click();
  await grid.locator(`[data-date="${value}"]`).click();
  await page.getByRole('button',{name:'Use this date',exact:true}).click();
  await page.waitForFunction(({field,value})=>document.querySelector(`[name="${field}"]`).value===value,{field,value});
}
