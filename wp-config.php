<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the web site, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * Localized language
 * * ABSPATH
 *
 * @link https://wordpress.org/support/article/editing-wp-config-php/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'local' );

/** Database username */
define( 'DB_USER', 'root' );

/** Database password */
define( 'DB_PASSWORD', 'root' );

/** Database hostname */
define( 'DB_HOST', 'localhost' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',          '.AT&gHR_2vixA-9GXz&BgJS_lGh3QZuXXKDG<8j*.~5=XZA4c+ m4_^rufVEM:e ' );
define( 'SECURE_AUTH_KEY',   '1<I.F-VWJ(:H*_^UiDo `C?^]ziRZ<+/#a8VFlFU5HsC<.Y4p=|Q+OR##ul_hlpR' );
define( 'LOGGED_IN_KEY',     'mJE9$*pb8f,u7|VdHU!Zy;Nc0l5LQl}[O-kMUOTC Mr_?G7+Fo#9r9Bu}1s?B78v' );
define( 'NONCE_KEY',         'ZYBIgwUv)P>]#!b+G?OhQ`#bj|LE K26Ui#H!a`&^NqxfV#$xZa((Fct|JlpHI,l' );
define( 'AUTH_SALT',         'j;(^m%*s;I;j.S[6g(ZzW8F4TR0TJe:wy3x}N0_U`DQ {~ [gI^KH6gz0r2pm9VF' );
define( 'SECURE_AUTH_SALT',  'bI0~aU_!d} O9gRyn+~}4z/Mk~RJCM!xG>S<E]+8T|Z.qua/{V8dFqiy/.2Vo%xi' );
define( 'LOGGED_IN_SALT',    '8]pYGODSiuIBIyeU@/eyvdZ!SIy9eZLL>c~ng|aG1XLZjQrXnLDr0KO-;W`Zss}6' );
define( 'NONCE_SALT',        '1 )jZoN n`qPOpc2V;L.X8wS68+.yduG`.YQ<Z<B.SpwOtdLq c*thy[?J}^Q(SZ' );
define( 'WP_CACHE_KEY_SALT', '#M&:+{@oAai(O&vColT |@cg!Yz~nJOo(nJ<1w8) :kR45KSDkYNmvF55`:sq8bw' );


/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 */
$table_prefix = 'wp_';


/* Add any custom values between this line and the "stop editing" line. */



/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://wordpress.org/support/article/debugging-in-wordpress/
 */
if ( ! defined( 'WP_DEBUG' ) ) {
	define( 'WP_DEBUG', false );
}

define( 'WP_ENVIRONMENT_TYPE', 'local' );
/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
