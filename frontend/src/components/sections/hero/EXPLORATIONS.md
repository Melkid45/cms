# Hero explorations
Local review page: `/hero-explorations.html`. Four compositions with actual header variants; no CMS registration or existing collection changes.

- v13 (was v9 before the merge; v9 is taken by the Harbstone library): hospitality, continuous photographic canvas with separated headline and action.
- v14 (was v10): B2B, introductory row and image/capabilities composition.
- v11: furniture, product-focused surface with supporting information.
- v12: fitness/wellness, centered content between staggered portrait photographs.

Headers are sticky inside each preview scene so the page can compare four complete first screens. Production header partials keep their fixed positioning. Each scene measures its own header with ResizeObserver; desktop hero height is 100svh minus that header. Mobile content can grow naturally.

Verified desktop scene height equals viewport at 1920x1080, 1440x768 and 1024x768; no horizontal overflow at 390x844. Mobile menu opens below the header and closes without retaining the scroll lock.

Shared container, typography, buttons, radius and section spacing come from the existing template system. The colocated `hero-explorations.scss` owns composition only.

Stock photographs downloaded from Unsplash:
- stay: https://images.unsplash.com/photo-1611892440504-42a792e24d32
- engineering: https://images.unsplash.com/photo-1581092160562-40aa08e78837
- chair: https://images.unsplash.com/photo-1598300042247-d088f8ab3a91

Links are demonstration email actions, not a booking or commerce integration.

Additional stock: https://images.unsplash.com/photo-1517836357463-d25dfeac3438 and https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b
