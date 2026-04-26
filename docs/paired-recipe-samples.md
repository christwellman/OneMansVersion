# Paired Recipe Samples

Paste these into a new recipe in the app to verify the paired-recipe display.

A recipe renders in paired mode when both the **Ingredients** and **Instructions** fields use the same set of `[Section Name]` headers (case-insensitive) and neither field has any non-header content before its first header. Anything else falls back to the legacy two-column layout.

---

## Sample 1 — Hawaiian Chicken Kabobs

**Ingredients:**

```
[Marinade]
1/2 cup pineapple juice
1/4 cup soy sauce
2 tablespoons brown sugar
2 tablespoons rice vinegar
2 cloves garlic, minced
1 teaspoon fresh ginger, grated

[Kabobs]
2 pounds boneless skinless chicken thighs, cut into 1-inch cubes
1 red bell pepper, cut into 1-inch chunks
1 yellow bell pepper, cut into 1-inch chunks
1 red onion, cut into 1-inch chunks
1 small fresh pineapple, peeled and cut into 1-inch chunks

[Glaze]
1/4 cup reserved marinade
1 tablespoon honey
1 teaspoon cornstarch
```

**Instructions:**

```
[Marinade]
Whisk pineapple juice, soy sauce, brown sugar, rice vinegar, garlic, and ginger in a bowl.
Reserve {1/4 cup} of the marinade for the glaze.
Add chicken to the remaining marinade; cover and refrigerate at least 30 minutes (up to 4 hours).

[Kabobs]
Soak wooden skewers in water for 20 minutes if using.
Thread chicken, peppers, onion, and pineapple onto skewers, alternating pieces.
Grill over medium-high heat 4 minutes per side, basting with marinade, until chicken is cooked through (~165F internal).

[Glaze]
Combine reserved marinade, honey, and cornstarch in a small saucepan.
Simmer 2 minutes, whisking, until thickened.
Brush over kabobs in the last minute on the grill and serve.
```

Expected: 3 rows in the paired table — Marinade, Kabobs, Glaze.

---

## Sample 2 — Pork Dumplings (smallest viable test)

**Ingredients:**

```
[Dough]
2 cups all-purpose flour
3/4 cup warm water
1/4 teaspoon salt

[Filling]
1 pound ground pork
2 tablespoons soy sauce
1 tablespoon sesame oil
2 stalks green onion, minced
```

**Instructions:**

```
[Dough]
Whisk flour and salt.
Add water gradually and knead until smooth.
Cover and rest 30 minutes.

[Filling]
Combine pork, soy sauce, sesame oil, and green onion.
Mix until just sticky.
```

Expected: 2 rows — Dough, Filling.

---

## Sample 3 — Flat fallback (regression check)

**Ingredients:**

```
2 cups all-purpose flour
1 teaspoon salt
3 large eggs
1/2 cup melted butter
```

**Instructions:**

```
Preheat oven to 350F.
Combine flour and salt in a bowl.
Beat in eggs and melted butter.
Bake 25 minutes until golden.
```

Expected: legacy two-column layout (no headers → flat mode).

---

## Sample 4 — Mismatched headers (also flat)

**Ingredients:**

```
[Dough]
2 cups flour
[Sauce]
1 cup tomato
```

**Instructions:**

```
[Dough]
Mix dough.
```

Expected: legacy two-column layout. The ingredients have a `[Sauce]` section that the instructions don't, so the header sets disagree and paired mode is not triggered.
