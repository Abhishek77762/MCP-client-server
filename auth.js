import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as DiscordStrategy } from "passport-discord";
import OAuth2Strategy from "passport-oauth2";
import User from "./models/user.js";

export function configurePassport() {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (e) {
      done(e);
    }
  });

  const upsertUser = async ({ provider, providerId, email, name, avatar }) => {
    let user = await User.findOne({ provider, providerId });
    if (!user && email) {
      user = await User.findOne({ email });
    }
    if (!user) {
      user = new User({ provider, providerId, email, name, avatar, password: undefined });
    } else {
      user.provider = provider;
      user.providerId = providerId;
      if (email) user.email = email;
      if (name) user.name = name;
      if (avatar) user.avatar = avatar;
    }
    await user.save();
    return user;
  };

  // Google
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
    }, async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const name = profile.displayName;
        const avatar = profile.photos?.[0]?.value;
        const user = await upsertUser({ provider: 'google', providerId: profile.id, email, name, avatar });
        done(null, user);
      } catch (e) { done(e); }
    }));
  }

  // GitHub
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || "/api/auth/github/callback",
      scope: ["user:email"]
    }, async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = (profile.emails && profile.emails[0] && profile.emails[0].value) ? profile.emails[0].value.toLowerCase() : undefined;
        const name = profile.displayName || profile.username;
        const avatar = profile.photos?.[0]?.value;
        const user = await upsertUser({ provider: 'github', providerId: profile.id, email, name, avatar });
        done(null, user);
      } catch (e) { done(e); }
    }));
  }

  // Discord
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    passport.use(new DiscordStrategy({
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: process.env.DISCORD_CALLBACK_URL || "/api/auth/discord/callback",
      scope: ["identify", "email"]
    }, async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.email?.toLowerCase();
        const name = profile.username;
        const avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : undefined;
        const user = await upsertUser({ provider: 'discord', providerId: profile.id, email, name, avatar });
        done(null, user);
      } catch (e) { done(e); }
    }));
  }

  // Hugging Face via generic OAuth2 (manual configuration)
  if (process.env.HF_CLIENT_ID && process.env.HF_CLIENT_SECRET) {
    passport.use('huggingface', new OAuth2Strategy({
      authorizationURL: process.env.HF_AUTH_URL || 'https://huggingface.co/oauth/authorize',
      tokenURL: process.env.HF_TOKEN_URL || 'https://huggingface.co/oauth/token',
      clientID: process.env.HF_CLIENT_ID,
      clientSecret: process.env.HF_CLIENT_SECRET,
      callbackURL: process.env.HF_CALLBACK_URL || '/api/auth/hf/callback'
    }, async (accessToken, _refreshToken, _params, profile, done) => {
      try {
        // Fetch user info from Hugging Face API
        const resp = await fetch('https://huggingface.co/api/whoami-v2', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const info = await resp.json();
        const providerId = String(info.id || info.name);
        const email = info.email?.toLowerCase();
        const name = info.name || info.username;
        const avatar = info.avatarUrl;
        const user = await upsertUser({ provider: 'huggingface', providerId, email, name, avatar });
        done(null, user);
      } catch (e) {
        done(e);
      }
    }));
  }
}







