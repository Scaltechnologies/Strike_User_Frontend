// Legal documents shown in-app at /legal/terms and /legal/privacy.
//
// Transcribed from the client-supplied PDFs ("STRIKE TERMS & CONDITIONS" and
// "Strike privacy policy updated", effective 7 October 2026). When the client
// sends a revised version, update the text here and bump `lastUpdated`.
//
// Deviations from the source PDFs (deliberate — see commit message):
//   • Terms §17: "[EXACT LEGAL ENTITY NAME]" placeholder filled with the
//     entity named in Terms §31.
//   • Privacy §5: internal drafting note about Play Console configuration
//     omitted (not user-facing text).
//   • Privacy §20: truncated email completed to match Privacy §18.

export const SUPPORT_EMAIL = 'support.striketechnologies@gmail.com';
export const SUPPORT_PHONE = '8143604709';
export const WEBSITE = 'www.strikeapp.in';
const LEGAL_ENTITY = 'Strike technologies private limited';

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'contact'; rows: { label: string; value: string; href?: string }[] };

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  effectiveDate?: string;
  lastUpdated?: string;
  intro: LegalBlock[];
  sections: LegalSection[];
  footer?: string;
}

const p = (text: string): LegalBlock => ({ type: 'p', text });
const list = (items: string[], ordered = false): LegalBlock => ({ type: 'list', items, ordered });

const contactRows = [
  { label: 'Email', value: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  { label: 'Phone', value: SUPPORT_PHONE, href: `tel:+91${SUPPORT_PHONE}` },
  { label: 'Website', value: WEBSITE, href: `https://${WEBSITE}` },
];

// ── Terms & Conditions ──────────────────────────────────────────────────────────

export const TERMS: LegalDocument = {
  title: 'Terms & Conditions',
  intro: [
    p('Welcome to STRIKE.'),
    p('These Terms & Conditions ("Terms") govern your access to and use of the STRIKE website, mobile application, digital membership services, subscription services and related technology platform (collectively, the "Platform").'),
    p(`STRIKE is a brand operated by ${LEGAL_ENTITY} ("STRIKE", "we", "us", or "our").`),
    p('By accessing the Platform, creating an account, purchasing a membership, or using any STRIKE service, you agree to be bound by these Terms.'),
    p('If you do not agree with these Terms, please do not use STRIKE.'),
  ],
  sections: [
    {
      title: '1. About STRIKE',
      blocks: [
        p('STRIKE is a digital subscription and membership infrastructure platform that connects customers with participating local businesses ("Vendors").'),
        p('Through STRIKE, customers may discover, purchase and use digital membership cards, prepaid subscriptions, consumption-based benefits, offers and other services made available by participating Vendors.'),
        p('STRIKE primarily provides technology infrastructure for:'),
        p('Discovery → Purchase → Digital Membership → Verification → Redemption → Usage Tracking'),
        p('Unless expressly stated otherwise, STRIKE is not the manufacturer, owner or direct provider of the underlying food, beverage, salon, gym, study-hall or other goods or services offered by a Vendor.'),
      ],
    },
    {
      title: '2. Participating Vendors',
      blocks: [
        p('Participating businesses using STRIKE are independent businesses ("Vendors").'),
        p('Vendors are responsible for:'),
        list([
          'The goods and services they provide',
          'Quality and quantity of their goods and services',
          'Availability',
          'Business operating hours',
          'Vendor-specific membership conditions',
          'Fulfilment of eligible benefits',
          'Applicable warranties, where applicable',
          'Compliance with applicable laws',
          'Accuracy of information provided to STRIKE',
        ]),
        p("STRIKE provides the technology infrastructure for memberships and transactions but does not control every aspect of a Vendor's independent business operations."),
        p('Nothing in these Terms limits any rights or remedies available to customers under applicable law.'),
      ],
    },
    {
      title: '3. Eligibility',
      blocks: [
        p('You may use STRIKE only if you are legally capable of entering into a binding agreement under applicable law.'),
        p('If you are below the applicable age of majority, you may use STRIKE only with the involvement and consent of a parent or legal guardian where required by law.'),
        p('By using STRIKE, you represent that the information you provide is accurate and complete.'),
      ],
    },
    {
      title: '4. STRIKE Account',
      blocks: [
        p('Certain STRIKE features may require you to create an account.'),
        p('You agree to:'),
        list([
          'Provide accurate and complete information',
          'Keep your information updated',
          'Protect your login credentials and OTPs',
          'Not share your account with unauthorised persons',
          'Notify STRIKE if you suspect unauthorised access',
          "Be responsible for activity conducted through your account, except where caused by STRIKE's own failure to maintain reasonable security",
        ]),
        p("You must not use another person's account without authorisation."),
        p('STRIKE may suspend or terminate accounts involved in fraud, abuse, security violations or material breaches of these Terms, subject to applicable law.'),
      ],
    },
    {
      title: '5. Digital Memberships',
      blocks: [
        p('STRIKE may offer different types of digital memberships, subscriptions, passes and prepaid benefits.'),
        p('Each membership may have its own:'),
        list([
          'Price',
          'Validity period',
          'Benefits',
          'Number of units',
          'Usage limits',
          'Participating Vendors',
          'Redemption conditions',
          'Time restrictions',
          'Location restrictions',
          'Renewal conditions',
          'Cancellation conditions',
          'Refund conditions',
        ]),
        p('The membership-specific terms displayed to you before purchase form part of your agreement relating to that membership.'),
      ],
    },
    {
      title: '6. Prepaid Memberships and Consumption Units',
      blocks: [
        p('Certain STRIKE memberships may operate through prepaid consumption units.'),
        p('For example, a membership may provide a specified number of meals, visits, services or other eligible consumption units during a defined validity period.'),
        p('The applicable membership will specify:'),
        list([
          'The type of unit',
          'Number of units',
          'Validity period',
          'Eligible Vendor',
          'Redemption conditions',
          'Applicable restrictions',
        ]),
        p('Unless expressly stated otherwise or required by applicable law, unused units do not constitute cash or a deposit balance and cannot be exchanged for cash.'),
      ],
    },
    {
      title: '7. Membership Benefits',
      blocks: [
        p('Depending on the membership, benefits may include:'),
        list([
          'Prepaid products or services',
          'Discounts',
          'Special offers',
          'Member-only pricing',
          'Loyalty benefits',
          'Priority access',
          'Early access',
          'Business-specific benefits',
          'Other benefits described on the Platform',
        ]),
        p('Benefits may vary between Vendors and membership plans.'),
        p('A Vendor may modify or discontinue a particular offer where permitted by its applicable terms and law.'),
      ],
    },
    {
      title: '8. Purchase and Payment',
      blocks: [
        p('Membership prices and applicable charges will be displayed before you complete a purchase.'),
        p('The amount payable may include:'),
        list([
          'Membership price',
          'Applicable taxes',
          'Platform or service charges',
          'Other charges disclosed at checkout',
        ]),
        p('You agree to pay the amount displayed at checkout.'),
        p('Payments may be processed through third-party payment service providers.'),
        p('A purchase is considered successful only after STRIKE receives confirmation of successful payment.'),
        p('If a payment is debited from your account but the membership is not successfully issued, STRIKE will investigate the transaction and, where appropriate, facilitate reversal or refund in accordance with applicable law and payment-provider processes.'),
      ],
    },
    {
      title: '9. Pricing and Promotions',
      blocks: [
        p('The price applicable to a membership is generally the price displayed at the time you complete the purchase.'),
        p('STRIKE or Vendors may change prices for future purchases.'),
        p('Promotions, discounts and offers may have additional conditions, including:'),
        list([
          'Eligibility',
          'Validity period',
          'Maximum usage',
          'Minimum purchase requirements',
          'Vendor restrictions',
          'Payment restrictions',
          'Geographic restrictions',
          'Blackout periods',
          'Limited availability',
        ]),
        p('Unless expressly stated otherwise, promotions cannot be combined with other offers.'),
        p('STRIKE may correct pricing or promotional errors and modify or withdraw promotions where permitted by applicable law.'),
      ],
    },
    {
      title: '10. Redemption',
      blocks: [
        p('A membership may be redeemed only in accordance with the applicable membership conditions.'),
        p('The Vendor may be required to verify the membership before providing the applicable goods or services.'),
        p('STRIKE may record each redemption to maintain an accurate membership ledger.'),
        p("A successful redemption may reduce the customer's available units, entitlement or balance according to the applicable membership rules."),
      ],
    },
    {
      title: '11. Vendor Confirmation',
      blocks: [
        p('Where Vendor confirmation is required, a redemption is considered completed only after the Vendor confirms the applicable transaction through STRIKE or another authorised STRIKE mechanism.'),
        p('STRIKE may investigate disputed, duplicate, suspicious or unauthorised redemptions.'),
      ],
    },
    {
      title: '12. Unauthorised Use and Fraud',
      blocks: [
        p('You must not:'),
        list([
          'Share screenshots, QR codes or credentials to enable unauthorised use',
          'Duplicate or manipulate memberships',
          'Manipulate QR codes or digital credentials',
          'Circumvent redemption controls',
          "Use another person's membership without authorisation",
          'Make fraudulent redemption claims',
          'Manipulate promotional benefits',
          'Create fraudulent accounts',
          'Attempt to obtain benefits through technical or operational abuse',
        ]),
        p('STRIKE may restrict, suspend or terminate memberships or accounts involved in suspected fraud or abuse, subject to applicable law.'),
      ],
    },
    {
      title: '13. Cancellation and Refunds',
      blocks: [
        p('Cancellation and refund eligibility depends on:'),
        list([
          'The specific membership',
          'Membership-specific terms',
          'Vendor terms, where applicable',
          'Whether the membership has been activated',
          'Whether any benefit or unit has been used',
          'The reason for cancellation',
          'Applicable law',
          'Any refund policy displayed at the time of purchase',
        ]),
        p('Where a membership is clearly identified as non-refundable, it may not be refundable except where required by applicable law or expressly permitted by STRIKE.'),
        p('Where a refund is approved, it will generally be processed through the original payment method or another lawful method.'),
        p('Actual processing time may depend on the relevant payment service provider.'),
      ],
    },
    {
      title: '14. Vendor Closure or Service Failure',
      blocks: [
        p('If a Vendor permanently closes, materially stops providing the subscribed service, or is unable to honour a purchased membership, STRIKE may, where reasonably possible:'),
        list([
          'Assist with resolution',
          'Communicate with the Vendor',
          'Offer an alternative solution',
          'Facilitate transfer to another participating Vendor where available',
          'Facilitate an applicable refund',
          'Provide another reasonable remedy',
        ]),
        p('The applicable remedy will depend on the circumstances, membership terms and applicable law.'),
      ],
    },
    {
      title: '15. Service Availability',
      blocks: [
        p('Vendor services may be temporarily unavailable due to:'),
        list([
          'Business hours',
          'Holidays',
          'Capacity limitations',
          'Temporary closure',
          'Maintenance',
          'Public events',
          'Operational circumstances',
          'Force majeure events',
          'Other circumstances outside reasonable control',
        ]),
        p('Purchasing a membership does not necessarily guarantee immediate availability at every moment unless the membership expressly provides such a guarantee.'),
      ],
    },
    {
      title: '16. Customer Responsibilities',
      blocks: [
        p('You agree to use STRIKE lawfully, honestly and responsibly.'),
        p('You must not:'),
        list([
          'Use STRIKE for unlawful purposes',
          'Provide false information',
          'Commit fraud',
          'Abuse promotional offers',
          'Attempt unauthorised access',
          'Reverse engineer the Platform',
          'Interfere with Platform security',
          'Introduce malicious software',
          'Scrape or systematically copy Platform content without authorisation',
          'Misrepresent your identity',
          'Harass or abuse Vendors or STRIKE personnel',
          'Circumvent usage or redemption restrictions',
          'Resell memberships or benefits where prohibited',
        ]),
      ],
    },
    {
      title: '17. Intellectual Property',
      blocks: [
        p(`The STRIKE name, logo, trademarks, software, Platform design, interface, graphics, text, databases, technology and other intellectual property are owned by or licensed to ${LEGAL_ENTITY} or its licensors.`),
        p('Except as expressly permitted, you may not:'),
        list([
          'Copy',
          'Modify',
          'Reproduce',
          'Distribute',
          'Sell',
          'License',
          'Reverse engineer',
          'Create derivative works from',
          'Commercially exploit',
        ]),
        p('any STRIKE intellectual property without prior written permission.'),
        p('Third-party trademarks remain the property of their respective owners.'),
      ],
    },
    {
      title: '18. User Content, Reviews and Feedback',
      blocks: [
        p('Where STRIKE allows users to submit reviews, ratings, comments, photographs, feedback or other content, you are responsible for the content you submit.'),
        p('You represent that you have the necessary rights to submit such content.'),
        p('You must not submit:'),
        list([
          'Fake reviews',
          'Misleading information',
          'Defamatory content',
          'Unlawful content',
          'Impersonation',
          'Content intended to manipulate ratings',
          "Content that infringes another person's rights",
        ]),
        p('Subject to applicable law, you grant STRIKE a non-exclusive, worldwide, royalty-free licence to use submitted content for operating, improving and promoting the Platform.'),
        p('STRIKE may remove content that violates these Terms or applicable law.'),
      ],
    },
    {
      title: '19. Platform Availability',
      blocks: [
        p('STRIKE aims to provide reliable services but does not guarantee that the Platform will always be:'),
        list([
          'Available',
          'Uninterrupted',
          'Error-free',
          'Completely secure',
          'Free from technical defects',
          'Compatible with every device',
        ]),
        p("Temporary interruptions may occur because of maintenance, technical problems, network failures, third-party services or circumstances outside STRIKE's reasonable control."),
      ],
    },
    {
      title: '20. Third-Party Services',
      blocks: [
        p('STRIKE may integrate with third-party services including:'),
        list([
          'Payment providers',
          'Authentication services',
          'Mapping services',
          'Cloud infrastructure',
          'Communication services',
          'Analytics services',
          'Other technology providers',
        ]),
        p('Third-party services may be governed by their own terms and privacy policies.'),
      ],
    },
    {
      title: "21. STRIKE's Role and Vendor Responsibility",
      blocks: [
        p('STRIKE provides technology infrastructure connecting customers and participating Vendors.'),
        p('Except where STRIKE is expressly responsible under applicable law, STRIKE does not control the independent operation of Vendors.'),
        p('Vendors remain responsible for the underlying goods and services they provide, including their quality, availability, staff conduct, business operations and fulfilment obligations.'),
        p('Nothing in these Terms excludes or limits any liability that cannot lawfully be excluded or limited under applicable law.'),
      ],
    },
    {
      title: '22. Limitation of Liability',
      blocks: [
        p("To the maximum extent permitted by applicable law, STRIKE will not be liable for indirect, incidental, special or consequential losses arising from matters outside STRIKE's reasonable control or from the independent acts or omissions of Vendors."),
        p('This limitation does not apply to any liability that cannot legally be excluded or limited.'),
        p('Nothing in these Terms is intended to remove or restrict statutory rights available to consumers.'),
      ],
    },
    {
      title: '23. Fraud, Security and Misuse',
      blocks: [
        p('STRIKE may investigate activity that appears fraudulent, abusive, suspicious or inconsistent with legitimate use.'),
        p('Where appropriate and legally permitted, STRIKE may:'),
        list([
          'Suspend an account',
          'Restrict a membership',
          'Disable redemption',
          'Cancel fraudulent transactions',
          'Require additional verification',
          'Recover amounts obtained through fraud',
          'Take appropriate legal action',
        ]),
      ],
    },
    {
      title: '24. Suspension and Termination',
      blocks: [
        p('STRIKE may suspend or terminate access to the Platform or particular services where reasonably necessary due to:'),
        list([
          'Violation of these Terms',
          'Fraud',
          'Abuse',
          'Security risks',
          'Illegal activity',
          'Misuse of memberships',
          'Repeated violations',
          'Payment-related issues',
          'Legal or regulatory requirements',
        ]),
        p('Termination does not automatically eliminate rights or obligations that arose before termination.'),
        p('Any applicable refund or statutory remedy will remain subject to the relevant membership terms and applicable law.'),
      ],
    },
    {
      title: '25. Privacy',
      blocks: [
        p('Your use of STRIKE is also governed by the STRIKE Privacy Policy.'),
        p('The Privacy Policy explains how STRIKE collects, uses, stores and otherwise processes personal data.'),
        p('The Privacy Policy forms part of the overall legal framework governing your use of the Platform.'),
      ],
    },
    {
      title: '26. Grievance Redressal',
      blocks: [
        p('If you have a complaint regarding:'),
        list([
          'A membership',
          'Payment',
          'Redemption',
          'Vendor service',
          'Refund',
          'Account',
          'Platform functionality',
          'Any other STRIKE-related matter',
        ]),
        p('you should contact STRIKE through the support and grievance mechanism provided on the Platform.'),
        p('STRIKE will endeavour to acknowledge and address complaints within the timelines and manner required by applicable law.'),
        p('The current grievance/contact details are provided below.'),
      ],
    },
    {
      title: '27. Changes to These Terms',
      blocks: [
        p('STRIKE may update these Terms from time to time.'),
        p('The updated version will be published on the STRIKE Platform with a revised "Last Updated" date.'),
        p('Where required by applicable law, STRIKE may provide additional notice of material changes.'),
        p('Your continued use of STRIKE after the effective date of revised Terms constitutes acceptance of the revised Terms to the extent permitted by applicable law.'),
      ],
    },
    {
      title: '28. Governing Law',
      blocks: [
        p('These Terms shall be governed by the laws of India.'),
        p('Subject to applicable consumer-protection and other mandatory laws, disputes shall be subject to the jurisdiction of the courts having appropriate jurisdiction over the applicable matter.'),
        p('Nothing in these Terms is intended to prevent a consumer from exercising any statutory right or remedy available under applicable law.'),
      ],
    },
    {
      title: '29. Severability',
      blocks: [
        p('If any provision of these Terms is determined to be invalid, unlawful or unenforceable, that provision shall be interpreted or modified to the minimum extent necessary to make it enforceable, where legally possible.'),
        p('The remaining provisions shall continue in full force and effect.'),
      ],
    },
    {
      title: '30. Entire Agreement',
      blocks: [
        p('These Terms, together with:'),
        list([
          'The STRIKE Privacy Policy',
          'Applicable Cancellation & Refund Policy',
          'Membership-specific terms',
          'Vendor-specific terms or conditions disclosed at purchase',
        ]),
        p('constitute the principal terms governing your use of STRIKE.'),
        p('Where there is a conflict between these Terms and a specific membership term displayed at the time of purchase, the specific membership term will govern that membership to the extent of the conflict, subject to applicable law.'),
      ],
    },
    {
      title: '31. Contact and Legal Information',
      blocks: [
        p('STRIKE'),
        p(`Legal Entity: ${LEGAL_ENTITY}`),
        p('Registered Office: Flat no.305, Tirumala Enclave apartment, Chirala, Prakasam Bapatla, Andhra Pradesh, India, 523155'),
        { type: 'contact', rows: contactRows },
      ],
    },
  ],
  footer: `© 2026 ${LEGAL_ENTITY}. All rights reserved.`,
};

// ── Privacy Policy ──────────────────────────────────────────────────────────────

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  effectiveDate: '7 October 2026',
  lastUpdated: '7 October 2026',
  intro: [
    p('This Privacy Policy explains how Strike Technologies ("STRIKE", "we", "us", or "our") collects, uses, stores, protects, and shares information when you use the STRIKE mobile application, website, and related services (collectively, the "Services").'),
    p('By accessing or using STRIKE, you acknowledge that you have read and understood this Privacy Policy.'),
  ],
  sections: [
    {
      title: '1. About STRIKE',
      blocks: [
        p('STRIKE is a platform that helps users discover and access participating vendors, offers, memberships, meal plans, discounts, and related services.'),
        p('Our Services may include features such as:'),
        list([
          'Discovering nearby participating vendors',
          'Viewing offers and memberships',
          'Purchasing eligible products or services',
          'Accessing Strike Monthly and Strike Mealo offerings',
          'Making payments',
          'Using location-based features',
          'Scanning QR codes at participating vendors',
          'Managing your STRIKE account',
        ]),
      ],
    },
    {
      title: '2. Information We Collect',
      blocks: [
        p('We collect information that is necessary to provide and improve the Services.'),
      ],
    },
    {
      title: '2.1 Account and Personal Information',
      blocks: [
        p('When you register or use STRIKE, we may collect:'),
        list([
          'Full name',
          'Mobile phone number',
          'Email address, including information associated with Google/Gmail login',
          'Address',
          'Account information and identifiers associated with your STRIKE account',
        ]),
      ],
    },
    {
      title: '2.2 Location Information',
      blocks: [
        p('With your permission, STRIKE may access your precise device location.'),
        p('We use location information to:'),
        list([
          'Show participating vendors near you',
          'Improve location-based discovery',
          'Support delivery-related services',
          'Provide location-relevant offers and services',
          'Improve the functionality of the STRIKE platform',
        ]),
        p('You can manage location permissions through your device settings. Some location-based features may not function correctly if location access is disabled.'),
      ],
    },
    {
      title: '2.3 Payment Information',
      blocks: [
        p('STRIKE uses Razorpay as a payment service provider.'),
        p('When you make a payment, payment-related information may be processed through Razorpay and its relevant payment partners as necessary to complete and secure the transaction.'),
        p('STRIKE does not intend to store your complete card, UPI, banking, or other sensitive payment credentials on its own systems unless specifically stated at the time of collection.'),
        p('Payment processing is subject to the applicable privacy practices and terms of Razorpay and the relevant financial/payment service providers.'),
      ],
    },
    {
      title: '2.4 Device and Technical Information',
      blocks: [
        p('When you use STRIKE, certain technical information may be collected as necessary for operating, securing, and improving the application.'),
        p('This may include information such as:'),
        list([
          'Device and operating-system information',
          'Application version',
          'IP address',
          'Crash and diagnostic information',
          'Technical logs',
          'Information required for security and fraud prevention',
        ]),
        p('STRIKE does not use or collect the Android Advertising ID for advertising purposes based on our current practices.'),
      ],
    },
    {
      title: '2.5 QR Code / Camera Access',
      blocks: [
        p('STRIKE may request access to your device camera solely for scanning QR codes associated with participating vendors or STRIKE services.'),
        p('STRIKE does not provide a general-purpose photo-upload feature and does not use the camera to collect photographs for your profile.'),
        p('Camera access is used only when you actively use the QR-scanning feature.'),
      ],
    },
    {
      title: '3. How We Use Your Information',
      blocks: [
        p('We may use collected information to:'),
        list([
          'Create and manage your STRIKE account.',
          'Authenticate your account.',
          'Provide STRIKE services and features.',
          'Show nearby participating vendors.',
          'Facilitate delivery-related services.',
          'Process and confirm payments.',
          'Provide memberships, offers, meal plans, and other services.',
          'Allow QR-code-based verification at participating vendors.',
          'Communicate with you regarding your account or transactions.',
          'Provide customer support.',
          'Detect, prevent, and investigate fraud, abuse, unauthorized activity, and security incidents.',
          'Maintain and improve the application.',
          'Diagnose technical problems and application crashes.',
          'Comply with applicable laws, regulations, court orders, and lawful governmental requests.',
          'Protect the rights, property, safety, and security of STRIKE, our users, vendors, and other parties.',
        ], true),
        p('We will not use personal information for purposes that are materially different from those described in this Privacy Policy without providing appropriate notice and obtaining consent where required by applicable law.'),
      ],
    },
    {
      title: '4. Information Sharing and Disclosure',
      blocks: [
        p('STRIKE does not sell your personal information.'),
        p('We may share information where reasonably necessary to provide the Services.'),
      ],
    },
    {
      title: '4.1 Service Providers',
      blocks: [
        p('We may share relevant information with trusted service providers that help us operate STRIKE, such as payment processors, hosting providers, technical service providers, analytics or security providers, and other vendors providing services on our behalf.'),
        p('These providers are expected to process information only for legitimate purposes connected with the Services and subject to applicable contractual and legal requirements.'),
      ],
    },
    {
      title: '4.2 Razorpay',
      blocks: [
        p('Payments made through STRIKE may be processed by Razorpay.'),
        p('Information necessary for processing and securing transactions may be shared with Razorpay and relevant payment networks, banks, financial institutions, or other payment service providers.'),
        p("Razorpay's own privacy practices apply to information processed by Razorpay."),
      ],
    },
    {
      title: '4.3 Participating Vendors',
      blocks: [
        p('Where necessary to fulfil a transaction or service, STRIKE may provide a participating vendor with relevant information such as your name, contact information, order/service information, and delivery information.'),
        p('Only information reasonably necessary for providing the relevant service should be shared.'),
      ],
    },
    {
      title: '4.4 Legal and Regulatory Requirements',
      blocks: [
        p('We may disclose information where required or permitted by applicable law, including in response to:'),
        list([
          'Court orders',
          'Government requests',
          'Legal proceedings',
          'Regulatory requirements',
          'Fraud investigations',
          'Security or safety concerns',
        ]),
      ],
    },
    {
      title: '4.5 Business Transfers',
      blocks: [
        p('If STRIKE Technologies undergoes a merger, acquisition, restructuring, financing, sale of assets, or similar transaction, personal information may be transferred as part of that transaction, subject to applicable law and appropriate safeguards.'),
      ],
    },
    {
      title: '5. Children and Users Under 18',
      blocks: [
        p('STRIKE may be accessible to users under 18.'),
        p('Because STRIKE may collect personal information and precise location information, we take additional care regarding information relating to younger users.'),
        p("We do not knowingly use children's personal information for targeted advertising."),
        p('We do not knowingly collect information beyond what is reasonably necessary to provide the Services.'),
        p('Where applicable law or Google Play requirements require parental or guardian involvement, age verification, consent, or additional safeguards, STRIKE will implement the applicable requirements.'),
        p('Parents or legal guardians who believe that a child has provided personal information to STRIKE may contact us using the contact details provided below to request review or deletion, subject to applicable legal requirements.'),
      ],
    },
    {
      title: '6. Data Security',
      blocks: [
        p('We take reasonable technical, administrative, and organizational measures to protect personal information against unauthorized access, loss, misuse, alteration, or disclosure.'),
        p('Security measures may include:'),
        list([
          'Access controls',
          'Authentication mechanisms',
          'Secure transmission',
          'Restricted access to personal information',
          'Monitoring and security practices',
          'Reasonable safeguards for payment and transaction-related information',
        ]),
        p('However, no method of transmission or electronic storage is completely secure. Therefore, we cannot guarantee absolute security of information.'),
      ],
    },
    {
      title: '7. Data Retention',
      blocks: [
        p('We retain personal information only for as long as reasonably necessary for the purposes described in this Privacy Policy, including:'),
        list([
          'Providing Services',
          'Maintaining account records',
          'Completing transactions',
          'Resolving disputes',
          'Preventing fraud',
          'Meeting legal, regulatory, tax, accounting, or reporting requirements',
          'Enforcing agreements',
        ]),
        p('When information is no longer reasonably required, we may delete, anonymize, or securely dispose of it in accordance with applicable law.'),
      ],
    },
    {
      title: '8. Your Rights and Choices',
      blocks: [
        p('Depending on applicable law, you may have rights relating to your personal information, including the right to:'),
        list([
          'Request access to personal information',
          'Request correction of inaccurate information',
          'Request deletion of your account or personal information',
          'Withdraw consent where applicable',
          'Request information regarding how your data is processed',
          'Raise concerns or complaints regarding our handling of personal information',
        ]),
        p('Some information may need to be retained where required by law or where necessary for legitimate legal or security purposes.'),
      ],
    },
    {
      title: '9. Account and Data Deletion',
      blocks: [
        p('STRIKE provides users with the ability to request deletion of their account and associated personal information, subject to applicable legal and operational requirements.'),
        p('Users may initiate deletion through the account-management functionality provided in the STRIKE application, where available.'),
        p('Users may also submit a deletion request by contacting:'),
        { type: 'contact', rows: [contactRows[0]] },
        p('Deletion requests will be reviewed and processed within a reasonable period, subject to applicable law.'),
        p('Please note that certain information may be retained where legally required or reasonably necessary for fraud prevention, dispute resolution, financial records, security, or compliance.'),
      ],
    },
    {
      title: '10. Location Permissions',
      blocks: [
        p('STRIKE requests location permission because location is an important part of certain Services.'),
        p('Location information may be used to:'),
        list([
          'Identify nearby vendors',
          'Improve vendor discovery',
          'Support delivery',
          'Provide location-based services',
        ]),
        p('You can disable location permission through your device settings. If you do so, certain STRIKE features may become unavailable or less accurate.'),
        p('STRIKE will not use precise location information for unrelated purposes without appropriate notice and legal basis.'),
      ],
    },
    {
      title: '11. Camera Permission',
      blocks: [
        p('STRIKE may request camera access when you choose to scan a QR code.'),
        p('The camera is used for QR-code scanning associated with STRIKE or participating vendors.'),
        p('You may deny camera permission through your device settings. If camera access is denied, QR-scanning functionality may not be available.'),
      ],
    },
    {
      title: '12. Third-Party Services',
      blocks: [
        p('STRIKE may use third-party service providers to operate specific parts of the platform.'),
        p('These may include payment, hosting, security, analytics, authentication, infrastructure, and other technology providers.'),
        p('Third-party providers may process information in accordance with their own privacy policies and applicable law.'),
        p("Where STRIKE provides links or access to third-party services, users should review the applicable third party's privacy policy and terms."),
      ],
    },
    {
      title: '13. Google Login',
      blocks: [
        p('If you choose to sign in using Google/Gmail authentication, certain account information associated with your Google account may be provided to STRIKE according to the permissions and authentication flow presented to you.'),
        p('STRIKE uses such information to create and manage your STRIKE account and provide the Services.'),
        p("Your use of Google services is also subject to Google's applicable terms and privacy policies."),
      ],
    },
    {
      title: '14. Cookies and Similar Technologies',
      blocks: [
        p('If STRIKE operates websites or web-based services that use cookies or similar technologies, such technologies may be used for purposes such as:'),
        list([
          'Maintaining sessions',
          'Security',
          'Authentication',
          'Remembering preferences',
          'Understanding service usage',
          'Improving website performance',
        ]),
        p('Users may manage cookies through their browser settings where applicable.'),
      ],
    },
    {
      title: '15. Marketing Communications',
      blocks: [
        p('STRIKE may communicate with users regarding transactions, account activity, service updates, security matters, and other operational matters.'),
        p('Where marketing communications are sent, users may have the ability to opt out of promotional communications where required by applicable law.'),
        p('Opting out of promotional communications does not necessarily prevent essential service or transaction-related communications.'),
      ],
    },
    {
      title: '16. Data Transfers',
      blocks: [
        p('Your information may be processed or stored using service providers located in India or other jurisdictions where STRIKE or its service providers operate.'),
        p('Where information is transferred across jurisdictions, STRIKE will take reasonable steps to ensure that applicable legal and security requirements are followed.'),
      ],
    },
    {
      title: '17. Changes to This Privacy Policy',
      blocks: [
        p('STRIKE may update this Privacy Policy from time to time to reflect:'),
        list([
          'Changes to the Services',
          'Changes in technology',
          'Changes in applicable laws',
          'Changes in our data practices',
          'Changes in third-party service providers',
        ]),
        p('When material changes are made, we may provide notice through the application, website, email, or another appropriate method.'),
        p('The "Last Updated" date at the top of this Privacy Policy indicates when it was most recently revised.'),
      ],
    },
    {
      title: '18. Grievance and Privacy Contact',
      blocks: [
        p('For questions, requests, complaints, or concerns regarding privacy or personal information, please contact:'),
        p('Strike Technologies'),
        { type: 'contact', rows: [{ ...contactRows[0], label: 'Privacy & Support Email' }] },
        p('Please include sufficient information to help us understand and respond to your request.'),
      ],
    },
    {
      title: '19. Governing Law',
      blocks: [
        p('This Privacy Policy shall be interpreted in accordance with the applicable laws of India.'),
        p('Any disputes relating to this Privacy Policy or the processing of personal information shall be subject to the applicable jurisdiction of the competent courts in India.'),
      ],
    },
    {
      title: '20. Contact Us',
      blocks: [
        p("If you have any questions about this Privacy Policy or STRIKE's privacy practices, contact:"),
        p('Strike Technologies'),
        { type: 'contact', rows: [contactRows[0]] },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = { terms: TERMS, privacy: PRIVACY } as const;
export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;
