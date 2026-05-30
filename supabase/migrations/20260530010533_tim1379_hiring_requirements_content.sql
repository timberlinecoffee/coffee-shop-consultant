UPDATE hiring_requirement_sets
SET
  body        = 'All US employers must complete Form I-9 for every person hired to work in the United States. The employer must physically examine (or use the authorized remote-verification alternative for E-Verify-enrolled employers) acceptable identity and work-authorization documents within 3 business days of the employee''s first day of work for pay. Completed forms must be retained for 3 years from the date of hire or 1 year after termination, whichever is later. Employers may face civil fines of $281 to $2,789 per I-9 paperwork violation (2024 inflation-adjusted rates). See 8 C.F.R. 274a.2 and the USCIS M-274 Handbook for guidance on acceptable document combinations.',
  citation_url = 'https://www.uscis.gov/i-9'
WHERE country_code = 'US'
  AND title = 'Form I-9 Employment Eligibility Verification';

UPDATE hiring_requirement_sets
SET
  body        = 'E-Verify is a web-based system operated by the Department of Homeland Security (DHS) that compares information from an employee''s Form I-9 against DHS and Social Security Administration records. Participation is mandatory for federal contractors subject to the FAR E-Verify clause (FAR 22.1800) and is required by state law for some or all employers in Alabama, Arizona, Colorado, Florida, Georgia, Louisiana, Mississippi, North Carolina, Oklahoma, South Carolina, Tennessee, Utah, and others. Even where voluntary, enrollment provides a rebuttable presumption of compliance. Enrollment is free at e-verify.gov; employers must complete the Memorandum of Understanding before using the system.',
  citation_url = 'https://www.e-verify.gov'
WHERE country_code = 'US'
  AND title = 'E-Verify (If Applicable)';


UPDATE hiring_requirement_sets
SET
  body        = 'An Employer Identification Number (EIN) is required from the IRS before filing any employment tax returns or hiring employees. Apply online at IRS.gov for immediate issuance, by fax (4 business days), or by mail (4 to 5 weeks). The EIN appears on Form 941 (Employer''s Quarterly Federal Tax Return), Form 940 (Federal Unemployment Tax Act return), and W-2 wage statements. Sole proprietors using their Social Security Number for business income tax must still obtain a separate EIN once they hire employees. See 26 U.S.C. 3402 and IRS Publication 15 (Circular E).',
  citation_url = 'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers'
WHERE country_code = 'US'
  AND title = 'Federal EIN Registration';

UPDATE hiring_requirement_sets
SET
  body        = 'Employers must register with their state''s revenue department (or equivalent) for state income tax withholding and with the state workforce agency for unemployment insurance (UI) contributions before running the first payroll. Registration requirements, contribution rates, and filing frequencies vary by state. UI tax is paid solely by the employer; no employee deduction is permitted. Most states require separate accounts for withholding and UI. Failure to register on time may result in retroactive assessments, penalties, and interest. Verify current requirements with your state department of labor or department of revenue. See the DOL state unemployment tax overview at dol.gov/agencies/eta/employers.',
  citation_url = 'https://www.dol.gov/agencies/eta/employers'
WHERE country_code = 'US'
  AND title = 'State Withholding and UI Accounts';

UPDATE hiring_requirement_sets
SET
  body        = 'Workers compensation insurance is mandatory in virtually all US states for employers with one or more employees (exact thresholds and exemptions vary by state). Coverage must be secured before employees begin work. Employers may obtain coverage through a private insurer, a state fund, or a state monopoly fund where applicable. Self-insurance requires state approval and a financial security deposit. Penalties for non-compliance range from civil fines and stop-work orders to criminal charges. Texas is the only state that does not require coverage for private employers, though uninsured employers lose common-law defenses. See your state workers compensation board for premium rates and carrier requirements.',
  citation_url = 'https://www.dol.gov/agencies/owcp'
WHERE country_code = 'US'
  AND title = 'Workers'' Compensation Insurance';


UPDATE hiring_requirement_sets
SET
  body        = 'Federal law requires most private employers to display workplace posters produced by the US Department of Labor in a conspicuous location accessible to all employees. Required posters for most employers include: (1) Fair Labor Standards Act minimum-wage notice, (2) Employee Polygraph Protection Act notice, (3) Job Safety and Health poster (OSHA), (4) Family and Medical Leave Act notice (employers with 50 or more employees), and (5) Uniformed Services Employment and Reemployment Rights Act notice. Additional posters apply for federal contractors. All posters are available free of charge at dol.gov/agencies/whd/posters. Posting in electronic format is acceptable only where all employees work remotely and have readily available electronic access.',
  citation_url = 'https://www.dol.gov/general/topics/posters'
WHERE country_code = 'US'
  AND title = 'Federal Labor Law Posters';

UPDATE hiring_requirement_sets
SET
  body        = 'In addition to federal posters, employers must display state-mandated workplace notices. Typical state requirements include state minimum wage, state workers compensation notice, state unemployment insurance notice, state anti-discrimination notice, and where applicable, state family or paid sick leave notices. Requirements and approved formats change periodically; download current versions directly from your state labor department website each January. Many states require both English and Spanish versions where a significant portion of the workforce is Spanish-speaking. Non-compliance can result in fines and, in some states, increased employer liability in wage-and-hour litigation.',
  citation_url = 'https://www.dol.gov/agencies/whd/state'
WHERE country_code = 'US'
  AND title = 'State Labor Law Posters';


UPDATE hiring_requirement_sets
SET
  body        = 'Most US states and many local jurisdictions require food handlers -- employees who work with unpackaged food, food-contact surfaces, or utensils -- to obtain a food handler card or certificate before or shortly after beginning work. Requirements vary significantly by state and locality; some require certification within 30 days of hire, others before the first day. Certification typically involves completing an accredited course (2 to 4 hours, often online) and passing a short exam. Cards are generally valid for 2 to 3 years. The FDA Food Code (2022) provides the model regulatory framework adopted in whole or in part by most jurisdictions. Verify exact requirements with your local health department, as requirements differ even within states.',
  citation_url = 'https://www.fda.gov/food/retail-food-protection/food-code'
WHERE country_code = 'US'
  AND title = 'Food Handler Permits';

UPDATE hiring_requirement_sets
SET
  body        = 'Many states and local health departments require at least one Certified Food Protection Manager (CFPM) on site during all hours of operation. Accepted certifications include ServSafe (National Restaurant Association), the National Registry of Food Safety Professionals (NRFSP), Prometric, Always Food Safe, and other programs accredited by the American National Standards Institute Conference for Food Protection (ANSI-CFP). Examinations test food safety principles, hazard analysis, temperature control, and sanitation. Certification is typically valid for 5 years. A copy of the certificate must be available for inspection by the local health authority. Verify jurisdiction-specific requirements with your state or local health department.',
  citation_url = 'https://www.servsafe.com/ServSafe-Manager'
WHERE country_code = 'US'
  AND title = 'Food Manager Certification';


UPDATE hiring_requirement_sets
SET
  body        = 'Under the Immigration, Asylum and Nationality Act 2006 (as amended by the Immigration Act 2014 and the Immigration Act 2016), UK employers must conduct a right to work check on every prospective employee before employment begins, regardless of nationality. The check involves obtaining, examining, and retaining a clear copy of acceptable original documents listed in the Home Office Employer''s Guide, or using the Home Office online checking service for individuals with a digital immigration status or share code. An employer who conducts a compliant check obtains a statutory excuse against civil penalties of up to 60,000 GBP per illegal worker. Checks on time-limited leave must be repeated before expiry. The Home Office publishes a current list of acceptable documents at gov.uk/check-job-applicant-right-to-work.',
  citation_url = 'https://www.gov.uk/check-job-applicant-right-to-work'
WHERE country_code = 'GB'
  AND title = 'Right to Work Check';

UPDATE hiring_requirement_sets
SET
  body        = 'A Disclosure and Barring Service (DBS) check is required for roles involving regulated activity with children or adults at risk, and may be advisable for roles with access to vulnerable customers. Enhanced DBS checks with barred list checks are required for regulated activity as defined in the Safeguarding Vulnerable Groups Act 2006 (as amended by the Protection of Freedoms Act 2012). Standard DBS checks apply to roles listed in the Rehabilitation of Offenders Act 1974 (Exceptions) Order 1975. Most general food and beverage service roles do not require a DBS check. Employers must not request a DBS check without a lawful purpose, and must handle certificate information under the DBS Code of Practice and UK GDPR Article 9 (special category data). See the DBS eligibility guidance at gov.uk/find-out-dbs-check.',
  citation_url = 'https://www.gov.uk/find-out-dbs-check'
WHERE country_code = 'GB'
  AND title = 'DBS Check (If Applicable)';


UPDATE hiring_requirement_sets
SET
  body        = 'Employers must register as an employer with HM Revenue and Customs (HMRC) before the first payday. Registration is completed online at gov.uk/register-employer and typically takes up to 5 working days; apply well in advance. Registration generates a PAYE reference number and Accounts Office reference used for remitting income tax and National Insurance deductions. Under Real Time Information (RTI), employers must submit a Full Payment Submission (FPS) on or before each payday, reporting pay, tax, and National Insurance for every employee. Penalties apply for late FPS submissions (from 100 GBP per month depending on employer size). See HMRC guidance at gov.uk/paye-for-employers.',
  citation_url = 'https://www.gov.uk/paye-for-employers/setting-up-paye'
WHERE country_code = 'GB'
  AND title = 'PAYE Registration with HMRC';

UPDATE hiring_requirement_sets
SET
  body        = 'Employers must pay Class 1 National Insurance Contributions (NICs) at the employer rate (15% from April 2025 under Finance Act 2025 amendments) on employee earnings above the secondary threshold (approximately 5,000 GBP per year from April 2025). Employee NICs are deducted from pay and remitted to HMRC via the PAYE system. Under the Pensions Act 2008 and the Occupational and Personal Pension Schemes (Automatic Enrolment) Regulations 2010, employers must automatically enrol eligible workers -- those aged 22 to state pension age earning above 10,000 GBP per year -- into a qualifying workplace pension scheme. Minimum contributions are 3% employer and 5% employee of qualifying earnings. Employers must file a declaration of compliance with The Pensions Regulator within 5 months of their staging or duties start date.',
  citation_url = 'https://www.thepensionsregulator.gov.uk/en/employers'
WHERE country_code = 'GB'
  AND title = 'National Insurance and Pension Auto-Enrolment';


UPDATE hiring_requirement_sets
SET
  body        = 'Under the Employers'' Liability (Compulsory Insurance) Act 1969 and the Employers'' Liability (Compulsory Insurance) Regulations 1998, employers must maintain employers'' liability insurance with minimum cover of 5 million GBP from an authorised insurer and display the current certificate of insurance at each place of business, or make it available electronically where employees can readily access it. The certificate must show the employer''s name, the insurer''s name, and the period of cover. Failure to hold a valid policy is a criminal offence carrying a fine of up to 2,500 GBP per day. Failure to display the certificate carries a separate fine of up to 1,000 GBP. Self-employed persons without employees and most public bodies are exempt. See HSE guidance at hse.gov.uk/pubns/hse40.htm.',
  citation_url = 'https://www.hse.gov.uk/pubns/hse40.htm'
WHERE country_code = 'GB'
  AND title = 'Employer''s Liability Insurance Certificate';

UPDATE hiring_requirement_sets
SET
  body        = 'The Health and Safety Information for Employees Regulations 1989 require employers to either display the approved Health and Safety Executive "Health and Safety Law" poster (revised 2009 edition -- earlier editions are not compliant) in a prominent, readable position in each workplace, or provide each worker with the equivalent approved pocket card or leaflet. The poster must include the name and address of the enforcing authority and the employment medical advisory service for the workplace. Electronic display is permitted only if all employees can readily access it. Current posters and cards are available from HSE Books. See hse.gov.uk/pubns/books/lawposter.htm.',
  citation_url = 'https://www.hse.gov.uk/pubns/books/lawposter.htm'
WHERE country_code = 'GB'
  AND title = 'Health and Safety Law Poster';


UPDATE hiring_requirement_sets
SET
  body        = 'Under the Food Safety and Hygiene (England) Regulations 2013 (SI 2013/2996, implementing retained Regulation (EC) 852/2004), all food businesses must register with their local authority at least 28 days before opening or before the business changes ownership. Registration is free and does not need to be renewed, but the business must notify the local authority of any significant structural or operational change. Businesses handling certain products of animal origin or producing higher-risk products may require formal approval rather than registration. Registered businesses are subject to food hygiene inspections and receive a Food Hygiene Rating published on the Food Standards Agency website. Devolved regulations apply in Scotland (Food Hygiene (Scotland) Regulations 2006), Wales, and Northern Ireland.',
  citation_url = 'https://www.food.gov.uk/business-guidance/register-a-food-business'
WHERE country_code = 'GB'
  AND title = 'Food Business Registration';

UPDATE hiring_requirement_sets
SET
  body        = 'The Food Safety and Hygiene (England) Regulations 2013 (implementing Regulation (EC) 852/2004, Article 4) require food business operators to ensure that food handlers are supervised and instructed and trained in food hygiene matters commensurate with their work activity. No specific qualification is mandated by statute, but the Food Standards Agency recommends Level 2 Award in Food Safety in Catering (or equivalent) for food handlers and Level 3 Award for supervisory and management roles. Training must be documented and records made available to the local authority on request. Failure to demonstrate adequate training is a relevant factor in enforcement action under Regulation 19. Equivalent requirements apply under the Food Hygiene (Scotland) Regulations 2006 and devolved Welsh and Northern Irish legislation.',
  citation_url = 'https://www.food.gov.uk/business-guidance/food-hygiene-training'
WHERE country_code = 'GB'
  AND title = 'Food Hygiene Training';


UPDATE hiring_requirement_sets
SET
  body        = 'Employers must collect an employee''s Social Insurance Number (SIN) within 3 days of the start of employment and record it in the payroll records, as required under the Canada Pension Plan Act, the Employment Insurance Act, and the Income Tax Act. Employees with a SIN beginning with "9" hold a temporary work permit. Employers must verify that the work permit is valid, covers the type of employment being offered, and has not expired before the employee begins work. Employing a person without valid authorization to work in Canada is an offence under the Immigration and Refugee Protection Act, S.C. 2001, c. 27, with penalties including fines and imprisonment. Employers should maintain a copy of the work permit and set a calendar reminder before the expiry date.',
  citation_url = 'https://www.canada.ca/en/employment-social-development/services/sin.html'
WHERE country_code = 'CA'
  AND title = 'SIN and Work Authorization Verification';

UPDATE hiring_requirement_sets
SET
  body        = 'Under the Employment Insurance Act, S.C. 1996, c. 23, and EI Regulations SOR/96-332, employers must issue a Record of Employment (ROE) within 5 calendar days of an interruption of earnings (lay-off, dismissal, voluntary quit, illness, or injury). The ROE must be filed electronically via Service Canada''s ROE Web system (available at service.canada.ca). Paper ROE forms are available only for employers meeting a specified low-volume threshold. ROEs must be issued even if the employee does not intend to claim Employment Insurance benefits. Employers must retain a copy of each ROE for 6 years from the date of issue. Late or inaccurate ROEs can delay employee EI claims and may result in employer penalties.',
  citation_url = 'https://www.canada.ca/en/employment-social-development/services/roe.html'
WHERE country_code = 'CA'
  AND title = 'Record of Employment';


UPDATE hiring_requirement_sets
SET
  body        = 'Before making the first payroll payment, employers must register for a Business Number (BN) with the Canada Revenue Agency (CRA) and open a payroll deductions program account (BN suffix RP0001 or higher). Employers must deduct income tax under Part I of the Income Tax Act, Canada Pension Plan (CPP or CPP2) contributions, and Employment Insurance (EI) premiums from each employee''s remuneration and remit these amounts to the CRA by the due date. Remittance frequency -- quarterly, regular monthly, twice monthly, or accelerated -- depends on the employer''s average monthly withholding amount from the prior year. Employers must also file T4 slips and a T4 Summary with the CRA by the last day of February following the calendar year. Late remittances attract penalty and interest under ITA subsection 227(9).',
  citation_url = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/register-payroll-program-account.html'
WHERE country_code = 'CA'
  AND title = 'CRA Payroll Account (RP)';

UPDATE hiring_requirement_sets
SET
  body        = 'Most provinces levy a payroll-based health or social services tax on employers above specified thresholds: Ontario (Employer Health Tax Act, R.S.O. 1990, c. E.11) applies EHT on payrolls above CAD 1,000,000; British Columbia (Employer Health Tax Act, SBC 2018, c. 42) and Manitoba (Health and Post Secondary Education Tax Levy Act, C.C.S.M. c. H24) have similar levies. Quebec''s employer contribution rates under the Act Respecting the Quebec Pension Plan apply separately. All employers with employees in any province or territory must also register with the applicable workers compensation board before the first hire: WorkSafeBC (BC), WSIB (Ontario), CNESST (Quebec), WCB Alberta, and equivalents in other provinces. Workers compensation premiums are based on industry classification and insurable earnings. Failure to register is a regulatory offence in all provinces.',
  citation_url = 'https://www.wsib.ca/en/businesses'
WHERE country_code = 'CA'
  AND title = 'Provincial Employer Health Tax and WCB';


UPDATE hiring_requirement_sets
SET
  body        = 'Provincial and territorial employment standards legislation requires employers to post or provide employees with a notice of their rights under employment standards law. In Ontario (Employment Standards Act, 2000, S.O. 2000, c. 41, s. 2), the Ministry of Labour''s "Employment Standards in Ontario" poster must be posted in the workplace in a conspicuous location. In British Columbia (Employment Standards Act, RSBC 1996, c. 113), employers must post a copy of the Act or a summary approved by the director. Other provinces have similar requirements under their employment standards statutes. Employers should verify current poster requirements and download current versions annually from their provincial Ministry of Labour or equivalent website.',
  citation_url = 'https://www.ontario.ca/document/your-guide-employment-standards-act-0/posting-requirements'
WHERE country_code = 'CA'
  AND title = 'Employment Standards Poster';

UPDATE hiring_requirement_sets
SET
  body        = 'Provincial occupational health and safety legislation requires employers to post specified safety notices. In Ontario (Occupational Health and Safety Act, R.S.O. 1990, c. O.1, s. 25(2)(j)), employers must post the "In Case of Injury" poster (Form 82) issued by the WSIB, the names of the joint health and safety committee members or health and safety representative, and a copy of the OHSA or a notice of where workers may access it. In British Columbia (Workers Compensation Act, RSBC 2019, c. 1), employers must post the names of worker health and safety representatives. Requirements vary by province and by workplace size. Penalties for non-compliance include regulatory fines and, in serious cases, prosecution under the applicable OHS statute.',
  citation_url = 'https://www.canada.ca/en/employment-social-development/services/health-safety/workplace.html'
WHERE country_code = 'CA'
  AND title = 'Occupational Health and Safety Notice';


UPDATE hiring_requirement_sets
SET
  body        = 'Most Canadian provinces require food handlers to hold a valid food handler certificate. In Ontario, O. Reg. 493/17 (Food Premises) under the Health Protection and Promotion Act requires that a food handler certificate holder be on duty at all times food is being prepared. In British Columbia, the Food Premises Regulation (B.C. Reg. 210/99) requires at least one FoodSafe Level 1 certified person on site during all hours of operation. In Alberta, the Food Regulation (Alta. Reg. 31/2006) requires a ProSafe or equivalent certificate. Certificates are generally valid for 3 to 5 years. Some provinces impose employer obligations to train all food handlers, not just one certified supervisor. Verify current requirements with your provincial or territorial public health authority.',
  citation_url = 'https://www.canada.ca/en/health-canada/services/food-nutrition/food-safety.html'
WHERE country_code = 'CA'
  AND title = 'Food Handler Certification';

UPDATE hiring_requirement_sets
SET
  body        = 'All food businesses in Canada must obtain a food premises permit or operating licence from their local public health unit or municipal authority before commencing operations. This requirement flows from provincial public health and food safety legislation, including the Ontario Health Protection and Promotion Act, the British Columbia Food Safety Act, and the Alberta Public Health Act. Inspections are conducted at least annually, with frequency based on the risk classification of the establishment. The permit must be displayed in a prominent location in the food premises. Changes to the menu, food processes, equipment layout, or operating ownership that may affect food safety must be reported to the local health authority. Fees and renewal periods vary by municipality. Failure to hold a valid permit is a regulatory offence.',
  citation_url = 'https://www.canada.ca/en/health-canada/services/food-nutrition/legislation-guidelines/acts-regulations/safe-food-canadians-act.html'
WHERE country_code = 'CA'
  AND title = 'Public Health Permit and Inspection';


UPDATE hiring_requirement_sets
SET
  body        = 'Under the Migration Act 1958 (Cth) and the Migration Regulations 1994, Australian employers must not allow a non-citizen to work if the person does not hold a valid visa granting work rights, or if the work would be in breach of a visa condition. Employers should use the Visa Entitlement Verification Online (VEVO) system, operated by the Department of Home Affairs, to verify work entitlements before engagement and periodically during employment for visa holders with expiry dates. Knowingly employing an unlawful non-citizen or a visa holder working in breach of conditions is a civil penalty offence under s. 245AC (up to 93,900 AUD per contravention for a body corporate, from 1 July 2024) and a criminal offence under s. 245AB (up to 5 years imprisonment per offence). Australian citizens and permanent residents do not require a VEVO check.',
  citation_url = 'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online'
WHERE country_code = 'AU'
  AND title = 'VEVO Work Entitlement Check';

UPDATE hiring_requirement_sets
SET
  body        = 'New employees must complete a Tax File Number (TFN) Declaration (ATO form NAT 3092) within their first payment summary period. Employees who do not provide a TFN must have withholding tax applied at the top marginal rate (47% from 2024-25) plus Medicare levy, resulting in significant overtaxation that harms the employee. Employers enrolled in Single Touch Payroll (STP) must report TFN information digitally to the ATO on or before each payday via STP Phase 2 (mandatory for all employers from 1 January 2022). Paper TFN declarations must be lodged with the ATO within 14 days for non-STP employers. TFN declaration records must be retained for 5 years after the date of the last payment to which they relate.',
  citation_url = 'https://www.ato.gov.au/individuals-and-families/jobs-and-employment-types/working-as-an-employee/tax-file-number-declaration'
WHERE country_code = 'AU'
  AND title = 'TFN Declaration';


UPDATE hiring_requirement_sets
SET
  body        = 'Australian employers must hold an Australian Business Number (ABN) and register for Pay As You Go (PAYG) Withholding with the Australian Taxation Office (ATO) before making the first payment to an employee. Withholding amounts are calculated using ATO tax tables based on the employee''s TFN declaration and must be reported to the ATO through Single Touch Payroll (STP) on or before each payday. Withheld amounts are remitted quarterly (small withholders: under 25,000 AUD per year), monthly (medium withholders: 25,000 AUD to 1 million AUD), or weekly (large withholders: over 1 million AUD). Failure to register for PAYG withholding or to remit withheld amounts on time attracts penalties and interest under the Taxation Administration Act 1953 (Cth). STP Phase 2 is mandatory for all employers.',
  citation_url = 'https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding'
WHERE country_code = 'AU'
  AND title = 'ABN and PAYG Withholding Registration';

UPDATE hiring_requirement_sets
SET
  body        = 'Under the Superannuation Guarantee (Administration) Act 1992 (Cth), employers must make superannuation contributions for eligible employees at the minimum superannuation guarantee rate (11.5% of ordinary time earnings from 1 July 2024; 12% from 1 July 2025). Contributions must be paid at least quarterly, by the 28th day of the month following each quarter end, to a complying superannuation fund chosen by the employee. Employers must offer eligible employees a Standard Choice Form (ATO NAT 13080) within 28 days of their start date. Unpaid super becomes subject to the Superannuation Guarantee Charge (SGC), which includes the unpaid amount, an interest component (10% per annum), and an administration charge, and is not tax-deductible. Note: the Payday Super reforms (anticipated 2026) will require more frequent contribution payment if enacted before launch.',
  citation_url = 'https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/super-for-employers'
WHERE country_code = 'AU'
  AND title = 'Superannuation (Super Guarantee)';

UPDATE hiring_requirement_sets
SET
  body        = 'All Australian states and territories require employers to hold workers compensation insurance for their employees before the first hire. Each jurisdiction operates its own scheme: icare WorkCover in New South Wales (Workers Compensation Act 1987), WorkSafe Victoria (Workplace Injury Rehabilitation and Compensation Act 2013), WorkCover Queensland (Workers'' Compensation and Rehabilitation Act 2003), WorkCover SA (Return to Work Act 2014), WorkSafe Western Australia (Workers'' Compensation and Injury Management Act 2023), NT WorkSafe (Return to Work Act 1986), and Comcare for Commonwealth employers. Premium rates are based on industry classification, remuneration, and claims experience. Failure to hold required insurance is a criminal offence in all jurisdictions. Sole traders with no employees are generally exempt but should confirm with the relevant authority.',
  citation_url = 'https://www.safeworkaustralia.gov.au/workers-compensation'
WHERE country_code = 'AU'
  AND title = 'Workers'' Compensation Insurance';


UPDATE hiring_requirement_sets
SET
  body        = 'Under the Fair Work Act 2009 (Cth), s. 125, employers covered by the national workplace relations system must give every new employee the current Fair Work Information Statement (FWIS) before, or as soon as practicable after, commencement of employment. The FWIS explains the National Employment Standards (NES), modern award coverage, enterprise agreements, the right of entry provisions, and the role of the Fair Work Commission. Casual employees must additionally receive the Casual Employment Information Statement (CEIS). The Fair Work Ombudsman updates these statements from time to time; always download the current version from fairwork.gov.au before distributing. There is no requirement to post the FWIS as a wall poster, but employers must be able to demonstrate that each employee received it.',
  citation_url = 'https://www.fairwork.gov.au/employment-conditions/national-employment-standards/fair-work-information-statement'
WHERE country_code = 'AU'
  AND title = 'Fair Work Information Statement';

UPDATE hiring_requirement_sets
SET
  body        = 'Under the model Work Health and Safety Act 2011 (Cth, adopted in ACT, NSW, NT, QLD, SA, TAS, and WA with minor variations), employers (persons conducting a business or undertaking, PCBUs) must display or make accessible specified workplace safety information. Required notices include: emergency procedures and evacuation plans, first aid officer contact details, and the name and contact information of the health and safety representative (HSR) for each work group where one has been elected. For construction work, Safe Work Method Statements (SWMS) for high-risk construction work must be prepared and kept on site. The local council may also require display of the most recent food safety inspection certificate. Penalties for failing to display required safety information can reach 500 penalty units for an individual and 2,500 for a body corporate under model WHS law.',
  citation_url = 'https://www.safeworkaustralia.gov.au/resources/find-a-resource'
WHERE country_code = 'AU'
  AND title = 'Safe Work Australia Notices';


UPDATE hiring_requirement_sets
SET
  body        = 'Most Australian states and territories require food businesses (excluding ACT) to appoint a qualified Food Safety Supervisor (FSS) who holds a nationally recognised Statement of Attainment for units SITXFSA005 "Use hygienic practices for food safety" and SITXFSA006 "Participate in safe food handling practices" (or equivalent superseded units) from a registered training organisation (RTO). The FSS must be on site or contactable during all operating hours and must be able to supervise food handlers. The FSS certificate must generally be displayed in the premises (NSW Food Regulation 2015, cl. 19; Queensland Food Act 2006, s. 86; Victorian Food Act 1984, s. 19C). Certificates are generally valid for 5 years. A business owner may serve as their own FSS if they hold the qualification.',
  citation_url = 'https://www.foodstandards.gov.au/business/food-safety-programs-and-plans/food-safety-supervisor'
WHERE country_code = 'AU'
  AND title = 'Food Safety Supervisor Certificate';

UPDATE hiring_requirement_sets
SET
  body        = 'All Australian food businesses must notify or register with their local council before commencing food operations, under the Australia New Zealand Food Standards Code Standard 3.2.2A (mandatory food safety management tools, adopted under the Food Standards Australia New Zealand Act 1991) and state or territory food safety legislation. Registration categories -- notification only, registration, or approval with a documented food safety program -- depend on the type of food handling activity and the associated risk level under Standard 3.2.2A. Food businesses required to have a food safety program under Standard 3.2.1 must implement, maintain, and make available for inspection a documented program based on HACCP (Hazard Analysis and Critical Control Points) principles. Council registration must be renewed annually and fees vary by jurisdiction.',
  citation_url = 'https://www.foodstandards.gov.au/business/food-businesses/notification-and-registration'
WHERE country_code = 'AU'
  AND title = 'Council Food Business Registration';
