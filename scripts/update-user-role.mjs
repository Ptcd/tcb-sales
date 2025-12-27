import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateUserRole() {
  const email = "onkaulautosales@gmail.com";
  const newRole = "member"; // Valid roles: 'admin' or 'member'

  console.log(`Updating user ${email} to role: ${newRole}`);

  // First, find the user by email in auth
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error("Error listing users:", authError);
    process.exit(1);
  }

  const user = authUsers.users.find(u => u.email === email);
  
  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  console.log(`Found user: ${user.id}`);

  // Update the user_profiles table
  const { data, error } = await supabase
    .from("user_profiles")
    .update({ role: newRole })
    .eq("id", user.id)
    .select();

  if (error) {
    console.error("Error updating user role:", error);
    process.exit(1);
  }

  console.log("Successfully updated user role:", data);
}

updateUserRole();

