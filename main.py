import json
import logging
import os.path
import random
import re
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup
from requests import Response, HTTPError

# Load environment variables for email
def load_env():
    env_vars = {}
    try:
        with open('.env', 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env_vars[key] = value
    except FileNotFoundError:
        pass
    return env_vars

ENV = load_env()
SMTP_HOST = ENV.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(ENV.get('SMTP_PORT', '587'))
SMTP_USER = ENV.get('SMTP_USER', '')
SMTP_PASSWORD = ENV.get('SMTP_PASSWORD', '')
NOTIFICATION_EMAIL = ENV.get('NOTIFICATION_EMAIL', 'jaskaransingh4704@gmail.com')

def send_email(subject, body, to_email=NOTIFICATION_EMAIL):
    """Send email notification"""
    if not SMTP_USER or not SMTP_PASSWORD:
        print("Email credentials not configured. Skipping email notification.")
        return False
        
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        msg['To'] = to_email
        msg['Subject'] = subject
        
        msg.attach(MIMEText(body, 'html'))
        
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send email: {str(e)}")
        return False

class ConfigLoader:
    """Handles loading and caching of JSON configuration files"""
    
    def __init__(self):
        self._data_dir = "data"
        self._cache = {}
        
    def _load_json(self, filename: str) -> Dict[str, Any]:
        """Load JSON file from data directory"""
        if filename in self._cache:
            return self._cache[filename]
            
        filepath = os.path.join(self._data_dir, filename)
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Configuration file {filepath} not found")
            
        with open(filepath, 'r') as f:
            data = json.load(f)
            self._cache[filename] = data
            return data
            
    @property
    def constants(self) -> Dict[str, Any]:
        return self._load_json("constants.json")
        
    @property
    def headers(self) -> Dict[str, Any]:
        return self._load_json("headers.json")
        
    @property
    def facilities(self) -> Dict[str, Any]:
        return self._load_json("facilities.json")
        
    @property
    def countries(self) -> Dict[str, str]:
        return self._load_json("countries.json")

# Initialize global config loader
config_loader = ConfigLoader()

# Load constants
CONSTANTS = config_loader.constants
HOST = CONSTANTS["host"]
HEADER_KEYS = CONSTANTS["header_keys"]
FORMATS = CONSTANTS["formats"]
FILES = CONSTANTS["files"]
LOG_FORMAT = CONSTANTS["log_format"]
NONE = CONSTANTS["none_value"]

# Load headers
HEADERS = config_loader.headers
DEFAULT_HEADERS = {**HEADERS["default_headers"], "Host": HOST}
CACHE_CONTROL_HEADERS = HEADERS["cache_control_headers"]
DOCUMENT_HEADERS = {**DEFAULT_HEADERS, **CACHE_CONTROL_HEADERS, **HEADERS["document_headers"]}
JSON_HEADERS = {**DEFAULT_HEADERS, **HEADERS["json_headers"]}
SEC_FETCH_USER_HEADERS = HEADERS["sec_fetch_user_headers"]

# Load facilities data
FACILITIES_DATA = config_loader.facilities
FACILITIES = FACILITIES_DATA["facilities"]
ASC_FACILITIES = FACILITIES_DATA["asc_facilities"]

# Load countries
COUNTRIES = config_loader.countries

# Constants from formats
DATE_TIME_FORMAT = FORMATS["date_time_format"]
DATE_FORMAT = FORMATS["date_format"]
HTML_PARSER = FORMATS["html_parser"]

# Constants from files
CONFIG_FILE = FILES["config_file"]
ASC_FILE = FILES["asc_file"]
LOG_FILE = FILES["log_file"]

# Header keys
REFERER = HEADER_KEYS["referer"]
ACCEPT = HEADER_KEYS["accept"]
SET_COOKIE = HEADER_KEYS["set_cookie"]
CONTENT_TYPE = HEADER_KEYS["content_type"]
COOKIE_HEADER = HEADER_KEYS["cookie_header"]
X_CSRF_TOKEN_HEADER = HEADER_KEYS["x_csrf_token_header"]


def parse_date(date_str: str) -> date:
    return datetime.strptime(date_str, "%Y-%m-%d").date()


class NoScheduleIdException(Exception):
    def __init__(self):
        super().__init__("❌ No appointment schedule found. Please make sure you have an active visa application.")


class AppointmentDateLowerMinDate(Exception):
    def __init__(self):
        super().__init__("⚠️ Current appointment date is earlier than your specified minimum date")


class Logger:
    """Enhanced logger with user-friendly messages"""
    
    def __init__(self, log_file: str = None, log_format: str = LOG_FORMAT):
        self.log_formatter = logging.Formatter(log_format)
        self.root_logger = logging.getLogger()

        if log_file:
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(self.log_formatter)
            self.root_logger.addHandler(file_handler)

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(self.log_formatter)
        self.root_logger.addHandler(console_handler)

        self.root_logger.setLevel("DEBUG")
        
    def _format_message(self, message: str | Exception) -> str:
        """Format message to be more user-friendly"""
        msg = str(message)
        
        # Common message improvements
        improvements = {
            "Get sign in": "🔐 Signing into your account...",
            "Post sing in": "🔑 Verifying credentials...",
            "Get current appointment": "📅 Fetching your current appointment details...",
            "Not found facility_id": "⚠️ No facility selected - will auto-select one",
            "Not found asc_facility_id": "⚠️ No ASC facility selected - will auto-select one",
            "Get available date": "🔍 Searching for available appointment dates...",
            "No available dates": "😔 No appointment dates available at this time",
            "Get available time": "🕒 Checking available time slots...",
            "No available times": "😔 No time slots available for this date",
            "Server is busy": "⏳ Server is busy, waiting for response...",
            "Book": "📝 Attempting to book appointment...",
            "Get 401": "🔄 Session expired - reconnecting...",
            "Init csrf": "🔒 Initializing secure session...",
        }
        
        # Replace known messages with improved versions
        for old, new in improvements.items():
            if old in msg:
                return new
                
        return msg

    def __call__(self, message: str | Exception):
        msg = self._format_message(message)
        print(msg)  # Print directly to stdout for web UI
        self.root_logger.debug(message, exc_info=isinstance(message, Exception))


class Appointment:
    def __init__(self, schedule_id: str, description: str, appointment_datetime: Optional[datetime]):
        self.schedule_id = schedule_id
        self.description = description
        self.appointment_datetime = appointment_datetime


class Config:
    """Configuration manager for the visa appointment bot"""
    
    def __init__(self, config_file: str):
        self.config_file = config_file
        self.logger = logging.getLogger()

        # Initialize with defaults
        self.email: Optional[str] = None
        self.password: Optional[str] = None
        self.country: Optional[str] = None
        self.facility_id: Optional[str] = None
        self.asc_facility_id: Optional[str] = None
        self.schedule_id: Optional[str] = None
        self.need_asc = False
        self.min_date: date = datetime.now().date()
        self.max_date: Optional[date] = None

        self._load_config()

    def _load_config(self):
        """Load configuration from file with improved error handling"""
        if not os.path.exists(self.config_file):
            open(self.config_file, 'w').close()
            self.logger.warning("⚠️ Created new empty configuration file")
            return

        config_data = {}
        with open(self.config_file, "r") as f:
            for line in f.readlines():
                param = line.strip().split("=", maxsplit=1)
                if len(param) == 2:
                    key = param[0].strip()
                    value = param[1].strip()
                    if value and value != NONE:
                        config_data[key] = value
                    else:
                        config_data[key] = None

        # Validate required fields
        self.email = config_data.get("EMAIL")
        if not self.email:
            raise ValueError("❌ Email address is required in the configuration")

        self.password = config_data.get("PASSWORD")
        if not self.password:
            raise ValueError("❌ Password is required in the configuration")

        self.country = config_data.get("COUNTRY")
        if not self.country:
            raise ValueError("❌ Country code is required in the configuration")
        if self.country not in COUNTRIES:
            raise ValueError(f"❌ Invalid country code '{self.country}'. Valid options are: {', '.join(COUNTRIES.keys())}")

        # Parse dates
        min_date = config_data.get("MIN_DATE")
        if min_date:
            try:
                self.min_date = datetime.strptime(min_date, DATE_FORMAT).date()
            except (ValueError, TypeError):
                self.logger.warning("⚠️ Invalid minimum date format, using current date")
                self.min_date = datetime.now().date()

        max_date = config_data.get("MAX_DATE")
        if max_date and max_date != NONE:
            try:
                self.max_date = datetime.strptime(max_date, DATE_FORMAT).date()
            except (ValueError, TypeError):
                self.logger.warning("⚠️ Invalid maximum date format, no maximum date will be used")
                self.max_date = None

        # Load optional fields
        self.schedule_id = config_data.get("SCHEDULE_ID")
        if self.schedule_id:
            self.facility_id = config_data.get("FACILITY_ID")
            if self.facility_id and self.facility_id not in FACILITIES:
                self.logger.warning(f"⚠️ Invalid facility ID {self.facility_id}, will auto-select from available facilities")
                self.facility_id = None

            self.asc_facility_id = config_data.get("ASC_FACILITY_ID")
            if self.asc_facility_id and self.asc_facility_id not in ASC_FACILITIES:
                self.logger.warning(f"⚠️ Invalid ASC facility ID {self.asc_facility_id}, will auto-select from available facilities")
                self.asc_facility_id = None

    def set_facility_id(self, locations: dict[str, str]):
        """Set facility ID with user-friendly messages"""
        if self.facility_id and self.facility_id in FACILITIES:
            self.logger.info(f"🏢 Using configured facility: {self.facility_id} - {FACILITIES[self.facility_id]}")
            return

        self.facility_id = next(iter(locations))
        self.logger.info(f"🏢 Auto-selected facility: {self.facility_id} - {locations[self.facility_id]}")
        self.__save()

    def set_asc_facility_id(self, locations: dict[str, str]):
        """Set ASC facility ID with user-friendly messages"""
        if self.asc_facility_id and self.asc_facility_id in ASC_FACILITIES:
            self.logger.info(f"🏢 Using configured ASC facility: {self.asc_facility_id} - {ASC_FACILITIES[self.asc_facility_id]}")
            return

        self.asc_facility_id = next(iter(locations))
        self.logger.info(f"🏢 Auto-selected ASC facility: {self.asc_facility_id} - {ASC_FACILITIES.get(self.asc_facility_id, locations[self.asc_facility_id])}")
        self.__save()

    def set_schedule_id(self, schedule_ids: dict[str, Appointment]):
        """Set schedule ID with user-friendly messages"""
        self.schedule_id = next(iter(schedule_ids))
        selected_appointment = schedule_ids[self.schedule_id]
        self.logger.info(f"📋 Selected schedule: {self.schedule_id} - {selected_appointment.description}")
        self.__save()

    def __save(self):
        """Save configuration to file"""
        with open(self.config_file, "w") as f:
            f.write(
                f"EMAIL={self.email}"
                f"\nPASSWORD={self.password}"
                f"\nCOUNTRY={self.country}"
                f"\nFACILITY_ID={self.facility_id}"
                f"\nMIN_DATE={self.min_date.strftime(DATE_FORMAT)}"
                f"\nMAX_DATE={self.max_date.strftime(DATE_FORMAT) if self.max_date else NONE}"
                f"\nNEED_ASC={self.need_asc}"
                f"\nASC_FACILITY_ID={self.asc_facility_id}"
                f"\nSCHEDULE_ID={self.schedule_id}"
            )
        self.logger.debug("💾 Configuration saved")


class Bot:
    def __init__(self, config: Config, logger: Logger, asc_file: str):
        self.logger = logger
        self.config = config
        self.asc_file = asc_file
        self.url = f"https://{HOST}/en-{config.country}/niv"
        self.country_name = COUNTRIES.get(config.country, "Unknown")

        self.appointment_datetime: Optional[datetime] = None
        self.csrf: Optional[str] = None
        self.cookie: Optional[str] = None
        self.session = requests.session()
        self.asc_dates = dict()
        
        self.logger(f"🌍 Initializing bot for {self.country_name}")
        
        # Send email notification for bot start
        email_body = f"""
        <h2>Visa Appointment Bot Started</h2>
        <p><strong>Email:</strong> {self.config.email}</p>
        <p><strong>Country:</strong> {self.country_name}</p>
        <p><strong>Facility ID:</strong> {self.config.facility_id or 'Not specified'}</p>
        <p><strong>Min Date:</strong> {self.config.min_date}</p>
        <p><strong>Max Date:</strong> {self.config.max_date or 'Not specified'}</p>
        <p><strong>Start Time:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        """
            
        self.logger(f"🔔 Sending email notification for bot start")
        self.logger(f"🔔 Email: {self.config.email}")
        self.logger(f"🔔 Country: {self.country_name}")
        self.logger(f"🔔 Facility ID: {self.config.facility_id or 'Not specified'}")
        self.logger(f"🔔 Min Date: {self.config.min_date}")
        self.logger(f"🔔 Max Date: {self.config.max_date or 'Not specified'}")
        self.logger(f"🔔 Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        send_email(f"Visa Bot Started - {self.config.email}", email_body)

    def format_appointment_info(self, time_str: str, date_str: str, asc_time_str: Optional[str] = None, asc_date_str: Optional[str] = None) -> str:
        """Format appointment information in a user-friendly way"""
        log = (
            "\n╔════════════════════════╗\n"
            "║                        ║\n"
            "║   📅 Appointment Info  ║\n"
            "║                        ║\n"
            f"║   Time: {time_str}        ║\n"
            f"║   Date: {date_str}    ║\n"
        )

        if asc_time_str and asc_date_str:
            log += (
                "║                        ║\n"
                "║   🏢 ASC Details       ║\n"
                f"║   Time: {asc_time_str}        ║\n"
                f"║   Date: {asc_date_str}    ║\n"
            )

        log += (
            "║                        ║\n"
            "╚════════════════════════╝"
        )
        return log

    def safe_request(self, method: str, url: str, **kwargs) -> Response:
        """Make a request with proper error handling"""
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except HTTPError as e:
            if e.response.status_code == 401:
                self.logger("🔄 Session expired, reconnecting...")
                self.init()
                response = self.session.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            else:
                self.logger(f"❌ HTTP Error: {e.response.status_code} - {e.response.reason}")
                raise
        except Exception as e:
            self.logger(f"❌ Request failed: {str(e)}")
            raise

    @staticmethod
    def get_csrf(response: Response) -> str:
        return BeautifulSoup(response.text, HTML_PARSER).find("meta", {"name": "csrf-token"})["content"]

    def headers(self) -> dict[str, str]:
        headers = dict()

        if self.cookie:
            headers[COOKIE_HEADER] = self.cookie

        if self.csrf:
            headers[X_CSRF_TOKEN_HEADER] = self.csrf

        return headers

    def init(self):
        # noinspection PyBroadException
        try:
            self.session.close()
        except Exception:
            pass
        self.session = requests.Session()

        self.login()
        self.init_current_data()
        self.init_csrf_and_cookie()

        if not self.config.facility_id:
            self.logger("Not found facility_id")
            self.config.set_facility_id(self.get_available_facility_id())

        if self.config.need_asc and not self.config.asc_facility_id:
            self.logger("Not found asc_facility_id")
            self.config.set_asc_facility_id(self.get_available_asc_facility_id())

        self.init_asc_dates()

        self.logger(
            "Current appointment date and time: "
            f"{self.appointment_datetime.strftime(DATE_TIME_FORMAT) if self.appointment_datetime else 'No date'}"
        )

    def login(self):
        self.logger("Get sign in")
        response = self.session.get(
            f"{self.url}/users/sign_in",
            headers={
                COOKIE_HEADER: "",
                REFERER: f"{self.url}/users/sign_in",
                **DOCUMENT_HEADERS
            }
        )
        response.raise_for_status()
        cookies = response.headers.get(SET_COOKIE)

        self.logger("Post sing in")
        response = self.session.post(
            f"{self.url}/users/sign_in",
            headers={
                **DEFAULT_HEADERS,
                X_CSRF_TOKEN_HEADER: Bot.get_csrf(response),
                COOKIE_HEADER: cookies,
                ACCEPT: "*/*;q=0.5, text/javascript, application/javascript, application/ecmascript, "
                        "application/x-ecmascript",
                REFERER: f"{self.url}/users/sign_in",
                CONTENT_TYPE: "application/x-www-form-urlencoded; charset=UTF-8"
            },
            data=urlencode({
                "user[email]": self.config.email,
                "user[password]": self.config.password,
                "policy_confirmed": "1",
                "commit": "Sign In"
            })
        )
        response.raise_for_status()
        self.cookie = response.headers.get(SET_COOKIE)

    def init_current_data(self):
        self.logger("Get current appointment")
        response = self.session.get(
            self.url,
            headers={
                **self.headers(),
                **DOCUMENT_HEADERS
            }
        )
        response.raise_for_status()

        applications = BeautifulSoup(response.text, HTML_PARSER).find_all("div", {"class": "application"})

        if not applications:
            raise NoScheduleIdException()

        schedule_ids = dict()

        for application in applications:
            schedule_id = re.search(r"\d+", str(application.find("a")))

            if not schedule_id:
                continue

            schedule_id = schedule_id.group(0)
            description = ' '.join([x.get_text() for x in application.find_all("td")][0:4])
            appointment_datetime = application.find("p", {"class": "consular-appt"})
            if appointment_datetime:
                appointment_datetime = re.search(r"\d{1,2} \w+?, \d{4}, \d{1,2}:\d{1,2}",
                                                 appointment_datetime.get_text())

                if appointment_datetime:
                    appointment_datetime = datetime.strptime(appointment_datetime.group(0), "%d %B, %Y, %H:%M")
                else:
                    appointment_datetime = None

            schedule_ids[schedule_id] = Appointment(schedule_id, description, appointment_datetime)

        if not self.config.schedule_id:
            self.config.set_schedule_id(schedule_ids)

        self.appointment_datetime = schedule_ids[self.config.schedule_id].appointment_datetime

        if self.appointment_datetime and self.appointment_datetime.date() <= self.config.min_date:
            raise AppointmentDateLowerMinDate()

    def init_asc_dates(self):
        if not self.config.need_asc or not self.config.asc_facility_id:
            return

        if not os.path.exists(self.asc_file):
            open(self.asc_file, 'w').close()
        with open(self.asc_file) as f:
            # noinspection PyBroadException
            try:
                self.asc_dates = json.load(f)
            except:
                pass

        dates_temp = None

        # noinspection PyBroadException
        try:
            dates_temp = self.get_asc_available_dates()
        except:
            pass

        if dates_temp:
            dates = []
            for x in dates_temp:
                date_temp = parse_date(x)
                if self.config.min_date <= date_temp <= self.config.max_date:
                    dates.append(x)

            if len(dates) > 0:
                self.asc_dates = dict()
                for x in dates:
                    # noinspection PyBroadException
                    try:
                        self.asc_dates[x] = self.get_asc_available_times(x)
                    except:
                        pass

        with open(self.asc_file, 'w') as f:
            json.dump(self.asc_dates, f)

    def init_csrf_and_cookie(self):
        self.logger("Init csrf")
        response = self.load_change_appointment_page()
        self.cookie = response.headers.get(SET_COOKIE)
        self.csrf = Bot.get_csrf(response)

    def get_available_locations(self, element_id: str) -> dict[str, str]:
        self.logger("Get location list")
        locations = (BeautifulSoup(self.load_change_appointment_page().text, HTML_PARSER)
                     .find("select", {"id": element_id})
                     .find_all("option"))
        facility_id_to_location = dict()
        for location in locations:
            if location["value"]:
                facility_id_to_location[location["value"]] = location.text
        return facility_id_to_location

    def get_available_facility_id(self) -> dict[str, str]:
        self.logger("Get facility id list")
        locations = self.get_available_locations("appointments_consulate_appointment_facility_id")
        # Filter to only known facilities
        facilities = {id: name for id, name in locations.items() if id in FACILITIES}
        if facilities:
            return facilities
        return locations

    def get_available_asc_facility_id(self) -> dict[str, str]:
        self.logger("Get asc facility id list")
        locations = self.get_available_locations("appointments_asc_appointment_facility_id")
        # Filter to only known ASC facilities
        facilities = {id: name for id, name in locations.items() if id in ASC_FACILITIES}
        if facilities:
            return facilities
        return locations

    def load_change_appointment_page(self) -> Response:
        self.logger("Get new appointment")
        response = self.session.get(
            f"{self.url}/schedule/{self.config.schedule_id}/appointment",
            headers={
                **self.headers(),
                **DOCUMENT_HEADERS,
                **SEC_FETCH_USER_HEADERS,
                REFERER: f"{self.url}/schedule/{self.config.schedule_id}/continue_actions"
            }
        )
        response.raise_for_status()
        return response

    def get_available_dates(self) -> list[str]:
        self.logger("Get available date")
        response = self.session.get(
            f"{self.url}/schedule/{self.config.schedule_id}/appointment/days/"
            f"{self.config.facility_id}.json?appointments[expedite]=false",
            headers={
                **self.headers(),
                **JSON_HEADERS,
                REFERER: f"{self.url}/schedule/{self.config.schedule_id}/appointment"
            }
        )
        response.raise_for_status()

        data = response.json()
        dates = [x["date"] for x in data]
        dates.sort()
        return dates

    def get_available_times(self, available_date: str) -> list[str]:
        self.logger("Get available time")
        response = self.session.get(
            f"{self.url}/schedule/{self.config.schedule_id}/appointment/times/{self.config.facility_id}.json?"
            f"date={available_date}&appointments[expedite]=false",
            headers={
                **self.headers(),
                **JSON_HEADERS,
                REFERER: f"{self.url}/schedule/{self.config.schedule_id}/appointment"
            }
        )
        response.raise_for_status()
        data = response.json()
        times = data["available_times"] or data["business_times"]
        times.sort()
        return times

    def get_asc_available_dates(
            self,
            available_date: Optional[str] = None,
            available_time: Optional[str] = None
    ) -> list[str]:
        self.logger("Get available dates ASC")
        response = self.session.get(
            f"{self.url}/schedule/{self.config.schedule_id}/appointment/days/"
            f"{self.config.asc_facility_id}.json?&consulate_id={self.config.facility_id}"
            f"&consulate_date={available_date if available_date else ''}"
            f"&consulate_time={available_time if available_time else ''}"
            f"&appointments[expedite]=false",
            headers={
                **self.headers(),
                **JSON_HEADERS,
                REFERER: f"{self.url}/schedule/{self.config.schedule_id}/appointment"
            }
        )
        response.raise_for_status()
        data = response.json()
        dates = [x["date"] for x in data]
        dates.sort()
        return dates

    def get_asc_available_times(
            self,
            asc_available_date: str,
            available_date: Optional[str] = None,
            available_time: Optional[str] = None
    ) -> list[str]:
        self.logger("Get available times ASC")
        response = self.session.get(
            f"{self.url}/schedule/{self.config.schedule_id}/appointment/times/{self.config.asc_facility_id}.json?"
            f"date={asc_available_date}&consulate_id={self.config.schedule_id}"
            f"&consulate_date={available_date if available_date else ''}"
            f"&consulate_time={available_time if available_time else ''}"
            f"&appointments[expedite]=false",
            headers={
                **self.headers(),
                **JSON_HEADERS,
                REFERER: f"{self.url}/schedule/{self.config.schedule_id}/appointment"
            }
        )
        response.raise_for_status()
        data = response.json()
        times = data["available_times"] or data["business_times"]
        times.sort()
        return times

    def book(
            self,
            available_date: str,
            available_time: str,
            asc_available_date: Optional[str],
            asc_available_time: Optional[str]
    ):
        self.logger("Book")

        body = {
            "authenticity_token": self.csrf,
            "confirmed_limit_message": "1",
            "use_consulate_appointment_capacity": "true",
            "appointments[consulate_appointment][facility_id]": self.config.facility_id,
            "appointments[consulate_appointment][date]": available_date,
            "appointments[consulate_appointment][time]": available_time
        }

        if asc_available_date and available_time:
            self.logger("Add ASC date and time to request")
            body = {
                **body,
                "appointments[asc_appointment][facility_id]": self.config.asc_facility_id,
                "appointments[asc_appointment][date]": asc_available_date,
                "appointments[asc_appointment][time]": asc_available_time
            }

        self.logger(f"Request {body}")

        return self.session.post(
            f"{self.url}/schedule/{self.config.schedule_id}/appointment",
            headers={
                **self.headers(),
                **DOCUMENT_HEADERS,
                **SEC_FETCH_USER_HEADERS,
                CONTENT_TYPE: "application/x-www-form-urlencoded",
                "Origin": f"https://{HOST}",
                REFERER: f"{self.url}/schedule/{self.config.schedule_id}/appointment"
            },
            data=urlencode(body)
        )
    def process(self):
        RANDOM_MINUTE = random.choice([1, 2, 3])
        RANDOM_SECOND = random.randint(25, 30)
        WAIT_FOR_MINUTES = random.choice([30, 45, 60])
        cool_down_server = False
        print(f"[{self.config.email}] Please wait {RANDOM_MINUTE} minutes and {RANDOM_SECOND} seconds before starting the bot")
        self.init()
        while True:
            try:
                if cool_down_server:
                    self.logger(f"😴 In cool-down mode. Waiting {WAIT_FOR_MINUTES} minutes...")
                    time.sleep(WAIT_FOR_MINUTES * 60)
                    cool_down_server = False
                    continue
                
                time.sleep(RANDOM_MINUTE * 60)
                now = datetime.now()
                mod = now.minute % RANDOM_MINUTE
                name_of_facility = FACILITIES.get(self.config.facility_id, self.config.facility_id)
                
                if mod != 0 or now.second < RANDOM_SECOND:
                    if now.second % 10 == 0:
                        self.logger(f"[{self.config.email} : {name_of_facility}] ⏳ Wait: {RANDOM_MINUTE - mod} minutes seconds left")
                    continue

                try:
                    self.logger("⏳ Checking for appointments...")
                    available_dates = self.get_available_dates()
                except HTTPError as err:
                    if err.response.status_code != 401:
                        raise err

                    self.logger("🔄 Session expired - reconnecting...")
                    self.init()
                    self.logger("⏳ Checking for appointments...")
                    available_dates = self.get_available_dates()

                if not available_dates:
                    self.logger("😔 No appointment dates available at any location")
                    cool_down_server = True
                    continue

                # Show all available dates for user awareness
                dates_info = []
                after_current_found = False
                after_current_count = 0
                MAX_AFTER_DATES = 2
                
                for date_str in available_dates:
                    date_obj = parse_date(date_str)
                    
                    if self.config.max_date and date_obj > self.config.max_date:
                        dates_info.append(f"  • {date_str} (❌ after your max date)")
                    elif date_obj <= self.config.min_date:
                        dates_info.append(f"  • {date_str} (❌ before your min date)")
                    elif self.appointment_datetime and date_obj >= self.appointment_datetime.date():
                        if not after_current_found:
                            dates_info.append(f"\n⚠️ Following dates are after your current appointment ({self.appointment_datetime.strftime(DATE_FORMAT)}):")
                            after_current_found = True
                        if after_current_count < MAX_AFTER_DATES:
                            dates_info.append(f"  • {date_str}")
                            after_current_count += 1
                        elif after_current_count == MAX_AFTER_DATES:
                            dates_info.append(f"  • ... and more dates available")
                            after_current_count += 1
                    else:
                        dates_info.append(f"  • {date_str} (✅ in range)")

                self.logger("📅 Available dates:" + ("\n" if dates_info else " None found"))
                if dates_info:
                    self.logger("\n".join(dates_info))
                    
                # Add a blank line after the dates list
                self.logger("")

                reinit_asc = False
                for available_date_str in available_dates:
                    available_date = parse_date(available_date_str)

                    if available_date <= self.config.min_date:
                        continue

                    if self.appointment_datetime and available_date >= self.appointment_datetime.date():
                        continue

                    if self.config.max_date and available_date > self.config.max_date:
                        continue

                    available_times = self.get_available_times(available_date_str)
                    if not available_times:
                        self.logger(f"⏰ No available time slots for {available_date_str}")
                        continue

                    self.logger(f"⏰ Available times for {available_date_str}: {', '.join(available_times)}")

                    booked = False
                    for available_time_str in available_times:
                        self.logger(f"🎯 Trying time slot: {available_time_str}")

                        asc_available_date_str = None
                        asc_available_time_str = None

                        if self.config.need_asc:
                            asc_available_date_str = None
                            asc_available_time_str = None

                            min_asc_date = available_date - timedelta(days=7)

                            for k, v in self.asc_dates.items():
                                if min_asc_date <= parse_date(k) < available_date and len(v) > 0:
                                    asc_available_date_str = k
                                    asc_available_time_str = random.choice(v)
                                    break

                            if not asc_available_date_str or not asc_available_time_str:
                                asc_available_dates = self.get_asc_available_dates(
                                    available_date_str,
                                    available_time_str
                                )

                                if not asc_available_dates:
                                    self.logger("🏢 No ASC dates available for this time slot")
                                    break

                                asc_available_date_str = asc_available_dates[0]

                                asc_available_times = self.get_asc_available_times(
                                    asc_available_date_str,
                                    available_date_str,
                                    available_time_str
                                )

                                if not asc_available_times:
                                    self.logger("🏢 No ASC time slots available for this date")
                                    continue

                                asc_available_time_str = random.choice(asc_available_times)

                        log = self.format_appointment_info(
                            available_time_str,
                            available_date_str,
                            asc_available_time_str,
                            asc_available_date_str
                        )

                        self.logger(log)

                        self.book(
                            available_date_str,
                            available_time_str,
                            asc_available_date_str,
                            asc_available_time_str
                        )

                        appointment_datetime = self.appointment_datetime
                        self.init_current_data()

                        if appointment_datetime != self.appointment_datetime:
                            log = self.format_appointment_info(
                                self.appointment_datetime.strftime(DATE_TIME_FORMAT),
                                self.appointment_datetime.strftime(DATE_FORMAT)
                            )

                            # Send email notification for successful booking
                            email_body = f"""
                            <h2>🎉 Appointment Successfully Booked!</h2>
                            <p><strong>Email:</strong> {self.config.email}</p>
                            <p><strong>Country:</strong> {self.country_name}</p>
                            <p><strong>Facility:</strong> {FACILITIES.get(self.config.facility_id, self.config.facility_id)}</p>
                            <p><strong>New Appointment Date:</strong> {self.appointment_datetime.strftime(DATE_FORMAT)}</p>
                            <p><strong>New Appointment Time:</strong> {self.appointment_datetime.strftime('%H:%M')}</p>
                            <p><strong>Booked At:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                            """
                            self.logger(email_body)
                            self.logger(log)
                            
                            send_email(f"Appointment Booked - {self.config.email}", email_body)
                            
                            booked = True
                            break

                    reinit_asc = True

                    if booked:
                        break

                if reinit_asc and self.config.need_asc:
                    self.init_asc_dates()

            except KeyboardInterrupt:
                return
            except AppointmentDateLowerMinDate as err:
                self.logger(err)
                return
            except Exception as err:
                self.logger(err)
                
                # Send email notification for error
                error_body = f"""
                <h2>⚠️ Visa Bot Error</h2>
                <p><strong>Email:</strong> {self.config.email}</p>
                <p><strong>Country:</strong> {self.country_name}</p>
                <p><strong>Error:</strong> {str(err)}</p>
                <p><strong>Time:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                """
                # send_email(f"Visa Bot Error - {self.config.email}", error_body)


def main():
    """Main entry point for the visa appointment bot"""
    import sys
    
    print("\n🌟 USA Visa Appointment Bot")
    print("==========================\n")
    
    try:
        config_file = sys.argv[1] if len(sys.argv) > 1 else CONFIG_FILE
        print(f"📝 Using configuration file: {config_file}")
        
        logger = Logger(LOG_FILE)
        logger("🚀 Starting the appointment bot...")
        
        config = Config(config_file)
        logger(f"✅ Configuration loaded for {COUNTRIES[config.country]}")
        
        bot = Bot(config, logger, ASC_FILE)
        logger("🤖 Bot initialized successfully")
        
        print("\n⏳ Starting appointment search process...")
        print("Press Ctrl+C to stop the bot at any time\n")
        
        bot.process()
        
    except KeyboardInterrupt:
        print("\n\n👋 Bot stopped by user. Goodbye!")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        print("\nFor help, please check the documentation or report this issue.")
        sys.exit(1)


if __name__ == "__main__":
    main()
