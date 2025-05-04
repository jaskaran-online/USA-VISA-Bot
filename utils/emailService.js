const nodemailer = require('nodemailer');
require('dotenv').config();

// Create a transporter with Gmail SMTP settings
const createTransporter = () => {
  const email = process.env.SENDER_EMAIL;
  const password = process.env.SENDER_PASSWORD;
  
  if (!email || !password) {
    console.warn('Email notification credentials not found in .env file');
    return null;
  }
  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: email,
      pass: password
    }
  });
};

/**
 * Send an email notification when an appointment is successfully scheduled
 * @param {Object} options - Email options
 * @param {string} options.botName - Name of the bot
 * @param {string} options.botEmail - Email used for the visa account
 * @param {string} options.appointmentDate - The scheduled appointment date
 * @param {string} options.appointmentTime - The scheduled appointment time
 * @param {string} options.facility - The facility name
 * @param {string} options.country - The country name
 * @returns {Promise<Object>} - Result of the email sending operation
 */
const sendAppointmentNotification = async (options) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      return { success: false, error: 'Email transporter could not be created. Check .env file.' };
    }
    
    const recipientEmail = process.env.NOTIFICATION_EMAIL;
    
    if (!recipientEmail) {
      return { success: false, error: 'Notification email not found in .env file' };
    }

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: recipientEmail,
      subject: `🎉 Visa Appointment Successfully Scheduled by ${options.botName}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4f46e5; text-align: center;">Visa Appointment Successfully Scheduled!</h2>
          
          <div style="background-color: #f5f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Bot Name:</strong> ${options.botName}</p>
            <p style="margin: 5px 0;"><strong>Account:</strong> ${options.botEmail}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${options.appointmentDate}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${options.appointmentTime}</p>
            <p style="margin: 5px 0;"><strong>Facility:</strong> ${options.facility}</p>
            <p style="margin: 5px 0;"><strong>Country:</strong> ${options.country}</p>
          </div>
          
          <p style="color: #4b5563;">Your USA visa appointment has been successfully scheduled by the bot. Please check your visa account for confirmation.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 12px; color: #6b7280;">This is an automated notification from USA VISA Bot.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email notification sent successfully');
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending email notification:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendAppointmentNotification
}; 