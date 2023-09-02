# desmos-3d
A modification of the Desmos Graphing Calculator enabling existing (currently unused) 3D support with a custom grapher.

[You can access the current version here.](https://xarkenz.github.io/desmos-3d)

## DISCLAIMER
The URL of the script referenced in `index.html` (`calculator_desktop-...`)
was obtained through the official [Desmos Graphing Calculator](https://www.desmos.com/calculator),
and is owned solely by Desmos.

This software is not endorsed by Desmos in any way.

## Context
The Desmos 3D Calculator appears to have been in active development since around 2021, when it was first sighted.
Many others online have documented their findings about it, but I was unaware of its existence until very recently.
I was digging through the minified, obfuscated Graphing Calculator code (as one does) to try and understand
the expression parser, which I thought would help me with my Desmosify project. However, I quickly noticed the
abundant references to 3D, which I then investigated further. It eventually led me to try and enable the leftover 3D code,
which is what this repository is for.

All of the 3D *logic* (that is, evaluating expressions, computing graph shapes, and behaving as a 3D calculator in general)
is stored within the Desmos code, and is activated with 3D mode. The biggest part of 3D mode that is truly *missing* from
the code is the 3D *grapher*, which deals with actually rendering the graphs to the screen. There are many references to it
in the code, but it is only properly set up when the function `Calc._calc.initializeGrapher3d(cls)` is called with a
missing 3D grapher class as `cls`.

And that's the largest chunk of this project: recreating the 3D grapher class. A lot of progress has been made and
a lot more is to come.

## Features
There are a lot of features in the Desmos 3D calculator, so I may not list everything here, but I'll at least mention
the main things you might want to know when using the calculator. The list of features could always change
as the Desmos Team (which I have massive respect for!) develops the product. (This has happened before; for example,
there used to be cubes and octahedrons, and vectors were a very recent addition!)

### Points
Points can now contain 3 components in the form of `(x, y, z)`! These work very similarly to 2D points, but have
three additional operations defined: the dot (scalar) product, cross (vector) product, and magnitude. To enter a dot product,
type an asterisk or use the multiplication button on the built-in keyboard. For a cross product, enter the word
`cross` and the symbol should appear. Take the absolute value (`|p|`) to obtain the magnitude.

2D points still work, but are confined to the *xy*-plane.

*Note: Currently, points are just tiny spheres, which doesn't look great with lines. There are plans to change this in the future.*

### Surfaces
You can now graph equations of *x*, *y*, **and** *z*. These can be simple relations, such as `z = sin x + sin y`, or they can be
implicit equations, such as `xyz = 1`. The surfaces are (mostly) limited to the 3D space spanned by the graph bounds,
which can be changed in the settings menu in the top-right corner.

*Note: Weirdly, equations between* x *and* y *render as a curve in the* xy-*plane instead of surfaces. Again,*
*there are plans to change this in the future.*

It is also possible to graph polar equations in 3D. There are three types of polar equations that work:

- Cylindrical: `r = f(θ, z)` (theta, z)
- Spherical: `r = f(θ, φ)` (theta, phi)
- 2D extension: `z = f(r, θ)` (r, theta)

### Parametrics
There are two types of parametrics now:

- Parametric curves: `(x(t), y(t), z(t))`
- Parametric surfaces: `(x(u, v), y(u, v), z(u, v))`

### Functions
Each of these are entered by simply typing their name. As of very recently, they are all listed in the "functions" menu
on the built-in keyboard.

- `segment(p₀, p₁)`: A line segment from `p₀` to `p₁`.
- `triangle(p₀, p₁, p₂)`: A triangle with vertices `p₀`, `p₁`, and `p₂`.
- `sphere(p, r)`: A sphere centered at `p` with radius `r`.
- `vector(p₀, p₁)`: A vector (not a point) from `p₀` to `p₁`. (*Note: Dot and cross products work on vectors.
  The resulting vector is positioned at the `p₀` of the first vector in the product.*)
- `length(v)`: The magnitude of a vector or length of a line segment. Does not work on points; use `distance` instead.
  **Similarly to the Geometry Calculator, this can no longer be used on lists; use `count` instead.**
- `polygon(...)`: Not allowed.
