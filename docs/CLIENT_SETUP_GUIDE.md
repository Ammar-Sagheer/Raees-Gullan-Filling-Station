# Getting started: set up your pump so the first month's profit is right

This guide takes you from a blank app to your first day of readings, starting
on the **1st of a month**, so that at month end the Reports page shows the
whole month's profit. Follow the steps in order and do not skip the checks.

The examples use an imaginary pump: **Example Filling Station**, starting on
**1 November**. Your own figures replace the example ones.

---

## Before you open the app: collect five things

Do this on the **last night of the old month** (31 October in the example),
after the last sale of the day. Write each figure on paper.

| What | How to get it | Example |
|---|---|---|
| Meter reading of every nozzle | Read the number off the machine itself. Never copy it from the register or work it out. | Unit 1 Nozzle 1: 458,210.55 |
| Fuel in every tank | Dip each tank with the rod, then read the litres off your dip chart. | Petrol 3,240 L, Diesel 6,115 L |
| Today's price of each fuel | The price on the board. | Petrol Rs 268.50, Diesel Rs 281.20 |
| Cash in the safe | Count it. | Rs 450,000 |
| Who owes you, and whom you owe | From your register. | Customer Bilal Traders owes Rs 85,000 |

If you have bank accounts, the balance of each is a sixth thing to collect.

**Why the night before?** The app's first day is 1 November. Its opening
figures must be what you had at the very end of 31 October, which is the very
start of the 1st.

---

## Step 1. Sign in and change the password

1. Open your pump's web address and sign in with the email and password you
   were given.
2. Open **Account** in the left menu and set a password only you know.

---

## Step 2. Add your tanks (Settings)

Go to **Settings**, find the tanks, and press **Add a tank**. Do it once for
each tank in the ground.

| Field | What to type | Example |
|---|---|---|
| Name | A name you will recognise | `Petrol Tank` |
| Fuel | Petrol or Diesel | Petrol |
| Size (litres it holds) | The full capacity from the tank chart | `6000` |
| Fuel in it now (litres) | Your dip from the last night of the old month | `3240` |
| As of | **The 1st**, the first day you will use the app | `01/11/2026` |

Press save, then repeat for the diesel tank (for example `Diesel Tank`, Diesel,
`15000`, `6115`, `01/11/2026`).

**Check:** each tank now shows a gauge with the litres you typed. If the
gauge shows nonsense, edit the tank with the pencil and correct it.

**Do not** type the opening stock as 0 "for now". The month's profit counts
opening stock, so a wrong figure here makes the whole month's profit wrong.

---

## Step 3. Add your nozzles (Settings)

Press **Add a nozzle** for each nozzle on every dispenser.

| Field | What to type | Example |
|---|---|---|
| Unit (dispenser) | The dispenser's number. Two nozzles on one dispenser share a number. | `1` |
| Nozzle name | The label on the nozzle | `1` (or `A`) |
| Draws from | The tank it draws from | Petrol Tank |
| Meter reading now | The reading you wrote down on the last night | `458210.55` |
| First day in use | The 1st | `01/11/2026` |

Example for a pump with two dispensers, four nozzles:

| Unit | Nozzle | Draws from | Meter reading now |
|---|---|---|---|
| 1 | 1 | Petrol Tank | 458,210.55 |
| 1 | 2 | Petrol Tank | 301,775.20 |
| 2 | 1 | Diesel Tank | 612,904.80 |
| 2 | 2 | Diesel Tank | 590,118.35 |

**Check:** this is the most common mistake. The meter reading is the
**machine's figure**, not litres sold and not a figure from last month's
register. Type it exactly as the dial shows, with the decimals.

---

## Step 4. Set the fuel prices (Settings, Fuel prices)

Readings cannot be saved until each fuel has a price.

| Field | Example |
|---|---|
| Fuel | Petrol |
| Rate | `268.50` |
| Effective from | `01/11/2026` |

Add a second price for Diesel (`281.20`, effective `01/11/2026`).

**The price must be effective from the 1st**, or the first days of the month
will have no price. When the price changes later, add a new price with its new
start date. Never change the old one.

---

## Step 5. Opening cash (Treasury)

Open **Treasury**, press **Record cash**, and enter what is in the safe.

| Field | Example |
|---|---|
| Direction | In |
| Reason | **Already in the safe** |
| Amount | `450000` |
| Date | the last day of the old month, `31/10/2026` |

This can be recorded **once** only. If you keep no safe, skip this step.

---

## Step 6. Bank accounts (Banking), if you have any

Open **Banking**, press **Add a bank account**, and type the bank's name and
the **Opening balance** from your latest statement (example: `1,200,000`).
Skip this if you do not use a bank account for the business.

---

## Step 7. Customers who buy on credit (Customers)

For each credit customer press **Add customer** and fill in the name and
phone. If the customer already owes you money, fill in the **opening
balance**, answer **They owe the pump**, type the amount from your
register, and set **As of** to the close of the day before you start (30 September
for a 1 October start). The date matters: it puts the balance above the October
slips on the customer's statement.

| Customer | Opening balance | Direction |
|---|---|---|
| Bilal Traders | `85000` | They owe the pump |
| Farooq Transport | `0` | Nothing owed, starting fresh |

**Check:** add up the opening balances. The total must match the total of the
credit page in your register.

Skip customers you have no balance with; you can add them any time, even on
the day they first buy on credit.

---

## Step 8. Suppliers (Suppliers)

Press **Add a supplier** for the company or dealer you buy fuel from (example:
`Pak Petroleum Depot`). If you owe the supplier money from before the 1st,
open the supplier and add the amount as an opening balance (the app suggests
"An opening balance from the old register"). Without a supplier, deliveries
still work; the supplier is only for tracking what you owe.

---

## Step 9. Lubricants (Lubricants), if you sell oil

Press **Add a lubricant** for each product: its name, pack sizes and prices,
and the **opening stock** on the shelf (litres) with the date `01/11/2026`.
Skip this if you do not sell oil.

---

## Step 10. Staff logins (Account)

For every attendant who enters readings: open **Account**, add a staff login with
their name, email and a password, and leave their role as the staff role. Staff
can enter readings, deliveries and dips; they cannot see profit, expenses,
banking or the safe. Only you, the owner, can.

---

## Step 11. The first check, before you begin trading

Open the **Dashboard**. It should show:

- both tanks with the litres you typed in Step 2;
- no negative numbers anywhere;
- no "setup" reminder left over.

Then open **Readings** for 1 November. Each nozzle's **opening** figure must
be exactly what you typed in Step 3. If any is different, stop and fix the
nozzle before entering anything.

---

## The first day: 1 November

At the end of the day (or at your usual closing time) do these in order.

1. **Readings.** For each nozzle type the **closing reading** from the machine.
   The litres sold and the amount appear by themselves.
2. **Credit slips.** Under each nozzle press **+ Add customer**, pick the
   customer and type the litres on the slip. The amount fills in at the day's
   price.
3. **Cash is worked out for you.** It is what is left after the credit slips.
   Count the notes in the drawer. They must match. If they do not, find the
   difference now.
4. Press **Save**.
5. **Deliveries.** If a tanker came, open **Purchases** and enter the litres,
   the amount on the delivery note and the supplier.
6. **Dip.** Open **Stock** and record the dip of each tank, choosing whether
   you took it in the morning or at closing. The app compares the dip with
   what the books expect and shows a gain or loss.
7. **Expenses.** Whenever you pay a bill (electricity, salaries, rent,
   repairs) open **Expenses** and add it with its category and the date it
   was paid. **The month's profit is only right if every expense is entered.**
8. **Cash to the safe or the bank.** Record the day's cash in **Treasury**, or
   move it to a bank account with **Deposit to bank**.

**The big check:** compare the day's total sales and cash with your register
for the same day. They must agree to the paisa. If they do not, the cause is
nearly always one of the four setup figures in the table at the end of this
guide. Fix it on day 1, not at month end.

---

## Seeing the month's profit

- **Dashboard:** the month so far, always.
- **Reports:** the full month: sales, the cost of the stock you sold, expenses
  and the profit. Open it on or after the last day of the month.

The profit counts the cost of fuel and oil **sold**, not just bought, so a big
delivery on the 28th does not wreck the month.

**Be honest about the first month.** The fuel that was already in your tanks on
the 1st has no delivery behind it in the app, so its cost is estimated from the
price of the deliveries you record. If you recorded no deliveries yet, that
estimate is rough. The first month's profit is therefore close, not exact. From
the second month on, the opening stock is stock the app watched arrive, and the
figure is exact.

---

## The most common mistakes

| Mistake | What goes wrong | The fix |
|---|---|---|
| Meter reading copied from the register instead of the machine | Day 1 litres are wrong | Read the dial and correct the nozzle before day 1 |
| Opening stock of a tank left at 0 | Stock goes negative, profit is wrong | Edit the tank and type the dip |
| Price effective from a later date than the 1st | "No price for this date" | Add a price effective from the 1st |
| Expenses not entered | The profit looks too high | Enter every bill under Expenses |
| Credit slip typed against the wrong customer | A customer's balance is wrong | Correct the entry on that day |
| Deliveries forgotten | The tank shows a loss | Enter the delivery under Purchases |
| Dip entered on the wrong day | A false gain or loss | The dip belongs to the day it closes; correct the dip |
| Opening figures typed after trading started | The past cannot be changed quietly | Ask for help before changing anything |

---

## When something does not match

Do not guess and do not delete. Write down the date, the nozzle or tank, what
the app shows, and what your register shows, and send a photo of the register
page. A difference found on day 1 is a few minutes of work. The same difference
found at month end is a month of work.
